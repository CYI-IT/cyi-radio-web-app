const { and, eq, gt, isNull, sql } = require('drizzle-orm')
const { admins, adminRoles, adminSessions, rolePermissions, adminActivityLogs } = require('./schema.cjs')
const { ScheduleError } = require('./schedule-input.cjs')

class AdminError extends Error {
  constructor(status, message, retryAfter) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function findAdminSession(db, sessionHash) {
  if (!sessionHash) return null
  const [admin] = await db.select({ id: admins.id, displayName: admins.displayName, email: admins.email })
    .from(admins).innerJoin(adminSessions, eq(adminSessions.adminId, admins.id))
    .where(and(eq(adminSessions.tokenHash, sessionHash), isNull(admins.deactivatedAt),
      gt(adminSessions.expiresAt, sql`clock_timestamp()`)))
  return admin ?? null
}

async function adminPermissions(db, adminId) {
  const rows = await db.selectDistinct({ key: rolePermissions.permissionKey }).from(adminRoles)
    .innerJoin(rolePermissions, eq(adminRoles.roleKey, rolePermissions.roleKey))
    .where(eq(adminRoles.adminId, adminId))
  return new Set(rows.map(row => row.key))
}

async function authorizeAdmin(db, identity, required, lock = false) {
  const cli = typeof identity === 'string'
  const query = db.select({ id: admins.id }).from(admins)
  const scoped = cli
    ? query.where(and(eq(admins.email, identity), isNull(admins.deactivatedAt)))
    : query.innerJoin(adminSessions, eq(adminSessions.adminId, admins.id)).where(and(
      eq(adminSessions.tokenHash, identity.sessionHash), isNull(admins.deactivatedAt),
      gt(adminSessions.expiresAt, sql`clock_timestamp()`),
    ))
  const [admin] = await (lock ? scoped.for('share', { of: admins }) : scoped)
  if (!admin) {
    if (cli) throw new ScheduleError('Use an active administrator account.')
    throw new AdminError(401, 'Sign in to continue.')
  }
  const permissions = await adminPermissions(db, admin.id)
  if (!required.some(key => permissions.has(key))) {
    const message = 'The administrator lacks permission for this operation.'
    if (cli) throw new ScheduleError(message)
    throw new AdminError(403, message)
  }
  return { id: admin.id, permissions }
}

function recordAdminAction(db, actor, action, resource, resourceId, metadata) {
  return db.insert(adminActivityLogs).values({ adminId: actor.id, action, resource, resourceId, metadata })
}

module.exports = { AdminError, adminPermissions, authorizeAdmin, findAdminSession, recordAdminAction }
