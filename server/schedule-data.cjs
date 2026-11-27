const { and, asc, eq, inArray, isNull } = require('drizzle-orm')
const { presenters, programmes, scheduleSeries, scheduleExceptions } = require('./schema.cjs')
const { scheduleAt, scheduleToday, scheduleRange } = require('./occurrences.cjs')

const published = and(eq(scheduleSeries.publicationStatus, 'published'), isNull(scheduleSeries.archivedAt))

async function loadSeries(db, filter, activeCatalog = false) {
  const query = db.select({ series: scheduleSeries, exception: scheduleExceptions }).from(scheduleSeries)
    .leftJoin(scheduleExceptions, eq(scheduleSeries.id, scheduleExceptions.seriesId))
  if (activeCatalog) {
    query.innerJoin(programmes, and(eq(programmes.id, scheduleSeries.programmeId), isNull(programmes.archivedAt)))
      .innerJoin(presenters, and(eq(presenters.id, scheduleSeries.presenterId), isNull(presenters.archivedAt)))
  }
  const rows = await query.where(filter)
    .orderBy(asc(scheduleSeries.startsOn), asc(scheduleSeries.startTime), asc(scheduleSeries.id),
      asc(scheduleExceptions.occurrenceDate))

  const result = new Map()
  for (const { series, exception } of rows) {
    if (!result.has(series.id)) result.set(series.id, { ...series, exceptions: [] })
    if (exception) result.get(series.id).exceptions.push(exception)
  }
  return [...result.values()]
}

async function publicSchedule(db, timezone, now = new Date(), { today = false, range } = {}) {
  return db.transaction(async tx => {
    const series = await loadSeries(tx, published, true)
    const listKey = today || range ? 'programmes' : 'upcoming'
    const { current, [listKey]: list } = range
      ? { current: null, programmes: scheduleRange(series, range.from, range.to) }
      : (today ? scheduleToday : scheduleAt)(series, timezone, now)
    const entries = current ? [current, ...list] : list
    if (!entries.length) return { timezone, current: null, [listKey]: [] }

    const programmeIds = [...new Set(entries.map(entry => entry.programmeId))]
    const presenterIds = [...new Set(entries.map(entry => entry.presenterId))]
    const programmeRows = await tx.select({
      id: programmes.id, slug: programmes.slug, title: programmes.title,
      description: programmes.description, imagePath: programmes.imagePath,
    }).from(programmes).where(and(inArray(programmes.id, programmeIds), isNull(programmes.archivedAt)))
    const presenterRows = await tx.select({
      id: presenters.id, slug: presenters.slug, name: presenters.name,
      bio: presenters.bio, imagePath: presenters.imagePath,
    }).from(presenters).where(and(inArray(presenters.id, presenterIds), isNull(presenters.archivedAt)))

    const programmesById = new Map(programmeRows.map(row => [row.id, row]))
    const presentersById = new Map(presenterRows.map(row => [row.id, row]))
    function hydrate({ programmeId, presenterId, ...entry }) {
      return {
        ...entry,
        programme: programmesById.get(programmeId),
        presenter: presentersById.get(presenterId) ?? null,
      }
    }
    return { timezone, current: current ? hydrate(current) : null, [listKey]: list.map(hydrate) }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

module.exports = { loadSeries, published, publicSchedule }
