const { and, asc, desc, eq, inArray, isNull, ne, sql } = require('drizzle-orm')
const { admins, adminRoles, adminSessions, adminPasswordLinks, roles, adminActivityLogs, stationSettings } =
  require('./schema.cjs')
const { AdminError, authorizeAdmin, recordAdminAction } = require('./admin-actor.cjs')
const { accountTransaction, issuePasswordLink } = require('./admin-auth.cjs')
const { emailAddress, fields, text, uuid } = require('./schedule-input.cjs')

const adminFields = {
  id: admins.id, displayName: admins.displayName, email: admins.email, deactivatedAt: admins.deactivatedAt,
}
const management = ['admins.manage']

function createAdminManager(db, config, identity) {
  const write = work => accountTransaction(db, async tx => work(tx, await authorizeAdmin(tx, identity, management, true)))

  async function roleKeys(tx, input) {
    if (!Array.isArray(input) || input.length > 50 || input.some(role => typeof role !== 'string' || role.length > 100)) {
      throw new AdminError(400, 'Select valid roles.')
    }
    const keys = [...new Set(input)]
    if (!keys.length) return keys
    const found = await tx.select({ key: roles.key }).from(roles).where(inArray(roles.key, keys))
    if (found.length !== keys.length) throw new AdminError(400, 'Select valid roles.')
    return keys.sort()
  }

  async function findTarget(tx, id) {
    const [admin] = await tx.select(adminFields).from(admins).where(eq(admins.id, uuid(id))).for('update')
    if (!admin) throw new AdminError(404, 'The administrator does not exist.')
    const assigned = await tx.select({ key: adminRoles.roleKey }).from(adminRoles)
      .where(eq(adminRoles.adminId, admin.id)).orderBy(asc(adminRoles.roleKey))
    return { ...admin, roles: assigned.map(role => role.key) }
  }

  async function setRoles(tx, adminId, keys) {
    await tx.delete(adminRoles).where(eq(adminRoles.adminId, adminId))
    if (keys.length) await tx.insert(adminRoles).values(keys.map(roleKey => ({ adminId, roleKey })))
  }

  async function retainSuperAdmin(tx, before, after) {
    if (before.deactivatedAt || !before.roles.includes('super-admin')) return
    if (!after.deactivatedAt && after.roles.includes('super-admin')) return
    const [another] = await tx.select({ id: admins.id }).from(admins)
      .innerJoin(adminRoles, eq(adminRoles.adminId, admins.id))
      .where(and(ne(admins.id, before.id), isNull(admins.deactivatedAt), eq(adminRoles.roleKey, 'super-admin')))
      .limit(1)
    if (!another) throw new AdminError(409, 'Keep at least one active Super Admin.')
  }

  return {
    async list() {
      await authorizeAdmin(db, identity, management)
      const [accounts, availableRoles] = await Promise.all([
        db.select({ ...adminFields, role: adminRoles.roleKey }).from(admins)
          .leftJoin(adminRoles, eq(adminRoles.adminId, admins.id))
          .orderBy(asc(admins.displayName), asc(admins.email), asc(adminRoles.roleKey)),
        db.select({ key: roles.key, name: roles.name }).from(roles).orderBy(asc(roles.name)),
      ])
      const byId = new Map()
      for (const { role, ...admin } of accounts) {
        if (!byId.has(admin.id)) byId.set(admin.id, { ...admin, roles: [] })
        if (role) byId.get(admin.id).roles.push(role)
      }
      return { accounts: [...byId.values()], roles: availableRoles }
    },

    create(input) {
      fields(input, ['email', 'displayName', 'roles'])
      const email = emailAddress(input.email)
      const displayName = text(input.displayName, 'Display name', 200)
      return write(async (tx, actor) => {
        const keys = await roleKeys(tx, input.roles)
        const [admin] = await tx.insert(admins).values({ email, displayName, passwordHash: 'pending' })
          .onConflictDoNothing({ target: admins.email }).returning(adminFields)
        if (!admin) throw new AdminError(409, 'An administrator with that email already exists.')
        await setRoles(tx, admin.id, keys)
        await recordAdminAction(tx, actor, 'create', 'admin', admin.id, { ...admin, roles: keys })
        return { ...admin, roles: keys, passwordLink: await issuePasswordLink(tx, config, admin, actor) }
      })
    },

    update(id, input) {
      fields(input, ['roles', 'active'])
      if ('active' in input && typeof input.active !== 'boolean') throw new AdminError(400, 'Select an account status.')
      return write(async (tx, actor) => {
        const before = await findTarget(tx, id)
        const keys = 'roles' in input ? await roleKeys(tx, input.roles) : before.roles
        const active = input.active ?? !before.deactivatedAt
        const deactivatedAt = active ? null : before.deactivatedAt ?? new Date()
        const after = { ...before, roles: keys, deactivatedAt }
        await retainSuperAdmin(tx, before, after)
        const rolesChanged = keys.join('\0') !== before.roles.join('\0')
        if (rolesChanged) await setRoles(tx, before.id, keys)
        if (deactivatedAt !== before.deactivatedAt) {
          await tx.update(admins).set({ deactivatedAt }).where(eq(admins.id, before.id))
          if (!active) {
            await tx.delete(adminSessions).where(eq(adminSessions.adminId, before.id))
            await tx.delete(adminPasswordLinks).where(eq(adminPasswordLinks.adminId, before.id))
          }
        }
        if (rolesChanged || deactivatedAt !== before.deactivatedAt) {
          await recordAdminAction(tx, actor, 'update', 'admin', before.id, { before, after })
        }
        return after
      })
    },

    passwordLink(id) {
      return write(async (tx, actor) => {
        const admin = await findTarget(tx, id)
        if (admin.deactivatedAt) throw new AdminError(409, 'Reactivate this account before issuing a password link.')
        return issuePasswordLink(tx, config, admin, actor)
      })
    },
  }
}

async function readAuditLog(db, identity, before) {
  await authorizeAdmin(db, identity, ['audit.read'])
  const cursor = before === undefined ? undefined : uuid(before, 'Audit cursor')
  const limit = 30
  const entries = await db.select({
    id: adminActivityLogs.id, createdAt: adminActivityLogs.createdAt, action: adminActivityLogs.action,
    resource: adminActivityLogs.resource, resourceId: adminActivityLogs.resourceId, metadata: adminActivityLogs.metadata,
    administrator: admins.displayName, email: admins.email, adminId: admins.id,
  })
    .from(adminActivityLogs).innerJoin(admins, eq(adminActivityLogs.adminId, admins.id))
    .where(cursor ? sql`(${adminActivityLogs.createdAt}, ${adminActivityLogs.id}) < (
      SELECT created_at, id FROM admin_activity_logs WHERE id = ${cursor}
    )` : undefined)
    .orderBy(desc(adminActivityLogs.createdAt), desc(adminActivityLogs.id)).limit(limit + 1)
  const page = entries.slice(0, limit)
  return { entries: page, before: entries.length > limit ? page.at(-1).id : null }
}

const listenerDescription = 'listener-description'
const defaultDescription = 'Music, shows and conversations on CYI Radio.'

async function readStationSettings(db) {
  const [setting] = db
    ? await db.select({ value: stationSettings.value }).from(stationSettings).where(eq(stationSettings.key, listenerDescription))
    : []
  return { description: typeof setting?.value === 'string' ? setting.value : defaultDescription }
}

function updateStationSettings(db, identity, input) {
  fields(input, ['description'])
  const value = text(input.description, 'Listener introduction', 250)
  return accountTransaction(db, async tx => {
    const actor = await authorizeAdmin(tx, identity, ['settings.manage'], true)
    const before = await readStationSettings(tx)
    if (before.description !== value) {
      await tx.insert(stationSettings).values({ key: listenerDescription, value })
        .onConflictDoUpdate({ target: stationSettings.key, set: { value, updatedAt: new Date() } })
      await recordAdminAction(tx, actor, 'update', 'station_setting', listenerDescription,
        { before: before.description, after: value })
    }
    return { description: value }
  })
}

module.exports = { createAdminManager, readAuditLog, readStationSettings, updateStationSettings }
