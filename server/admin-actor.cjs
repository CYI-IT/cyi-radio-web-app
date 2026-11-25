const { and, eq, isNull } = require('drizzle-orm')
const { admins, adminRoles, rolePermissions, adminActivityLogs } = require('./schema.cjs')
const { ScheduleError } = require('./schedule-input.cjs')

async function authorizeAdmin(db, email, required) {
  const [admin] = await db.select({ id: admins.id }).from(admins)
    .where(and(eq(admins.email, email), isNull(admins.deactivatedAt)))
  if (!admin) throw new ScheduleError('Use an active administrator account.')

  const rows = await db.select({ key: rolePermissions.permissionKey }).from(adminRoles)
    .innerJoin(rolePermissions, eq(adminRoles.roleKey, rolePermissions.roleKey))
    .where(eq(adminRoles.adminId, admin.id))
  const permissions = new Set(rows.map(row => row.key))
  if (!required.some(key => permissions.has(key))) throw new ScheduleError('The administrator lacks permission for this operation.')
  return { id: admin.id, permissions }
}

function recordAdminAction(db, actor, action, resource, resourceId, metadata) {
  return db.insert(adminActivityLogs).values({ adminId: actor.id, action, resource, resourceId, metadata })
}

module.exports = { authorizeAdmin, recordAdminAction }
