const { randomBytes, randomUUID, scryptSync } = require('node:crypto')
const { and, asc, eq, isNull, ne, sql } = require('drizzle-orm')
const { admins, adminRoles, presenters, programmes, scheduleSeries, scheduleExceptions } = require('./schema.cjs')
const { authorizeAdmin: authorize, recordAdminAction: record } = require('./admin-actor.cjs')
const { ScheduleError, fields, text, emailAddress, uuid, date, catalogInput, seriesInput, exceptionInput } =
  require('./schedule-input.cjs')
const { includesDate, singleOccurrence, segmentsForSeries, findConflict } = require('./occurrences.cjs')
const { loadSeries, published } = require('./schedule-data.cjs')

const catalog = {
  programmes: { table: programmes, label: 'title', description: 'description', resource: 'programme' },
  presenters: { table: presenters, label: 'name', description: 'bio', resource: 'presenter' },
}
const timingFields = ['kind', 'startsOn', 'startTime', 'endsOn', 'weekdays', 'durationMinutes']

function writeTransaction(db, write) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(434721, 2)`)
    return write(tx)
  }, { isolationLevel: 'read committed' })
}

async function getCatalogItem(db, table, id) {
  const [item] = await db.select().from(table).where(eq(table.id, uuid(id)))
  if (!item) throw new ScheduleError('The record does not exist.')
  return item
}

async function requireActiveCatalog(db, table, id, label) {
  const [item] = await db.select({ id: table.id }).from(table)
    .where(and(eq(table.id, id), isNull(table.archivedAt)))
  if (!item) throw new ScheduleError(`Select an active ${label}.`)
}

async function assertUnscheduled(db, table, id) {
  const field = table === programmes ? scheduleSeries.programmeId : scheduleSeries.presenterId
  const [linked] = await db.select({ id: scheduleSeries.id }).from(scheduleSeries)
    .where(and(eq(field, id), isNull(scheduleSeries.archivedAt))).limit(1)
  if (linked) throw new ScheduleError('Archive the associated schedule series first.')
  if (table === presenters) {
    const [exception] = await db.select({ id: scheduleExceptions.seriesId }).from(scheduleExceptions)
      .innerJoin(scheduleSeries, eq(scheduleExceptions.seriesId, scheduleSeries.id))
      .where(and(eq(scheduleExceptions.presenterId, id), isNull(scheduleSeries.archivedAt))).limit(1)
    if (exception) throw new ScheduleError('Remove the presenter from the associated schedule exception first.')
  }
}

function overrideFor(actor, input, conflict) {
  const reason = text(input.overrideReason, 'Override reason', 500, true)
  if (!conflict) return null
  if (!reason) throw new ScheduleError('Published schedules overlap. An authorized override needs a reason.', { conflict })
  if (!actor.permissions.has('schedule.override')) {
    throw new ScheduleError('The administrator lacks permission to override conflicts.', { conflict })
  }
  return { reason, conflict }
}

async function getSeries(db, id) {
  const [series] = await loadSeries(db, eq(scheduleSeries.id, uuid(id)))
  if (!series) throw new ScheduleError('The schedule series does not exist.')
  return series
}

function requireUnarchived(item) {
  if (item.archivedAt) throw new ScheduleError('The record has been archived.')
}

async function changeSeries(db, actor, input, previous) {
  const values = seriesInput(input, previous)
  const proposed = { ...previous, ...values, id: previous?.id ?? randomUUID() }
  const exceptions = proposed.exceptions ?? []
  if (exceptions.some(exception => !includesDate(proposed, exception.occurrenceDate))) {
    throw new ScheduleError('Remove or update exceptions that fall outside the new recurrence.')
  }
  await requireActiveCatalog(db, programmes, proposed.programmeId, 'programme')
  await requireActiveCatalog(db, presenters, proposed.presenterId, 'presenter')

  const checkConflicts = proposed.publicationStatus === 'published' &&
    (previous?.publicationStatus !== 'published' || timingFields.some(field => proposed[field] !== previous[field]))
  let conflict = null
  if (checkConflicts) {
    const otherSeries = await loadSeries(db, and(published, ne(scheduleSeries.id, proposed.id)))
    conflict = findConflict(segmentsForSeries(proposed), otherSeries.flatMap(segmentsForSeries))
  }
  const override = overrideFor(actor, input, conflict)
  const [saved] = previous
    ? await db.update(scheduleSeries).set(values).where(eq(scheduleSeries.id, proposed.id)).returning()
    : await db.insert(scheduleSeries).values({ ...values, id: proposed.id }).returning()
  const { exceptions: _exceptions, ...before } = previous ?? {}
  await record(db, actor, previous ? 'update' : 'create', 'schedule_series', saved.id,
    { before: previous ? before : null, after: saved, override })
  return saved
}

async function changeException(db, actor, id, occurrenceDate, input, remove) {
  const series = await getSeries(db, id)
  requireUnarchived(series)
  const dateKey = date(occurrenceDate, 'Occurrence date')
  if (!includesDate(series, dateKey)) throw new ScheduleError('The date is outside this series recurrence.')
  const before = series.exceptions.find(exception => exception.occurrenceDate === dateKey) ?? null
  if (remove && !before) throw new ScheduleError('The schedule exception does not exist.')
  if (remove) fields(input, ['overrideReason'])
  const values = remove ? null : exceptionInput(input, series)
  if (values?.presenterId) await requireActiveCatalog(db, presenters, values.presenterId, 'presenter')

  const target = singleOccurrence(series, dateKey, values)
  const previous = singleOccurrence(series, dateKey, before)
  let conflict = null
  if (series.publicationStatus === 'published' && target &&
    (!previous || target.first !== previous.first || target.duration !== previous.duration)) {
    const otherSeries = await loadSeries(db, and(published, ne(scheduleSeries.id, series.id)))
    // Remove the affected occurrence from its own series before comparing it.
    otherSeries.push({
      ...series,
      exceptions: [...series.exceptions.filter(exception => exception.occurrenceDate !== dateKey),
        { occurrenceDate: dateKey, action: 'cancel' }],
    })
    conflict = findConflict([target], otherSeries.flatMap(segmentsForSeries))
  }
  const override = overrideFor(actor, input, conflict)
  let saved = null
  if (remove) {
    await db.delete(scheduleExceptions).where(
      and(eq(scheduleExceptions.seriesId, series.id), eq(scheduleExceptions.occurrenceDate, dateKey)),
    )
  } else {
    [saved] = await db.insert(scheduleExceptions).values({ ...values, seriesId: series.id, occurrenceDate: dateKey })
      .onConflictDoUpdate({
        target: [scheduleExceptions.seriesId, scheduleExceptions.occurrenceDate],
        set: values,
      }).returning()
  }
  await record(db, actor, remove ? 'remove' : 'set', 'schedule_exception', `${series.id}/${dateKey}`,
    { before, after: saved, override })
  return saved
}

async function bootstrapScheduleAdmin(db, email, name) {
  const normalized = emailAddress(email)
  const displayName = text(name, 'Display name', 200)
  return writeTransaction(db, async tx => {
    const [existing] = await tx.select({ id: admins.id }).from(admins).limit(1)
    if (existing) throw new ScheduleError('The initial administrator can only be created on a database with no administrators.')
    const salt = randomBytes(16)
    const hash = scryptSync(randomBytes(32), salt, 64)
    const [admin] = await tx.insert(admins).values({
      email: normalized, displayName, passwordHash: `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`,
    }).returning({ id: admins.id, email: admins.email, displayName: admins.displayName })
    await tx.insert(adminRoles).values({ adminId: admin.id, roleKey: 'super-admin' })
    await record(tx, admin, 'bootstrap', 'admin', admin.id, { role: 'super-admin' })
    return admin
  })
}

function createScheduleManager(db, email) {
  const actorEmail = emailAddress(email)
  const manageCatalog = ['programmes.manage']
  const manageSchedule = ['schedule.manage']
  const write = (permissions, change) =>
    writeTransaction(db, async tx => change(tx, await authorize(tx, actorEmail, permissions)))

  function catalogManager({ table, label, description, resource }) {
    return {
      async list() {
        await authorize(db, actorEmail, [...manageCatalog, ...manageSchedule])
        return db.select().from(table).orderBy(asc(table[label]), asc(table.id))
      },
      async get(id) {
        await authorize(db, actorEmail, [...manageCatalog, ...manageSchedule])
        return getCatalogItem(db, table, id)
      },
      create: input => write(manageCatalog, async (tx, actor) => {
        const values = catalogInput(input, null, label, description)
        const [saved] = await tx.insert(table).values(values).returning()
        await record(tx, actor, 'create', resource, saved.id, { after: saved })
        return saved
      }),
      update: (id, input) => write(manageCatalog, async (tx, actor) => {
        const before = await getCatalogItem(tx, table, id)
        requireUnarchived(before)
        const values = catalogInput(input, before, label, description)
        const [saved] = await tx.update(table).set(values).where(eq(table.id, before.id)).returning()
        await record(tx, actor, 'update', resource, saved.id, { before, after: saved })
        return saved
      }),
      archive: id => write(manageCatalog, async (tx, actor) => {
        const before = await getCatalogItem(tx, table, id)
        if (before.archivedAt) return before
        await assertUnscheduled(tx, table, before.id)
        const [saved] = await tx.update(table).set({ archivedAt: new Date() }).where(eq(table.id, before.id)).returning()
        await record(tx, actor, 'archive', resource, saved.id, { archivedAt: saved.archivedAt })
        return saved
      }),
    }
  }

  return {
    programmes: catalogManager(catalog.programmes),
    presenters: catalogManager(catalog.presenters),
    series: {
      async list() {
        await authorize(db, actorEmail, manageSchedule)
        return loadSeries(db)
      },
      async get(id) {
        await authorize(db, actorEmail, manageSchedule)
        return getSeries(db, id)
      },
      create: input => write(manageSchedule, (tx, actor) => changeSeries(tx, actor, input)),
      update: (id, input) => write(manageSchedule, async (tx, actor) => {
        const existing = await getSeries(tx, id)
        requireUnarchived(existing)
        return changeSeries(tx, actor, input, existing)
      }),
      archive: id => write(manageSchedule, async (tx, actor) => {
        const before = await getSeries(tx, id)
        if (before.archivedAt) return before
        const [saved] = await tx.update(scheduleSeries).set({ archivedAt: new Date() })
          .where(eq(scheduleSeries.id, before.id)).returning()
        await record(tx, actor, 'archive', 'schedule_series', saved.id, { archivedAt: saved.archivedAt })
        return saved
      }),
    },
    exceptions: {
      set: (id, day, input) => write(manageSchedule, (tx, actor) => changeException(tx, actor, id, day, input, false)),
      remove: (id, day, input = {}) => write(manageSchedule, (tx, actor) => changeException(tx, actor, id, day, input, true)),
    },
  }
}

module.exports = { bootstrapScheduleAdmin, createScheduleManager }
