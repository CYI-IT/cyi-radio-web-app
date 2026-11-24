const { randomUUID } = require('node:crypto')
const { sql } = require('drizzle-orm')
const {
  check, date, index, integer, jsonb, pgTable, primaryKey, text, time, timestamp, uuid,
} = require('drizzle-orm/pg-core')

const id = () => uuid('id').primaryKey().$defaultFn(randomUUID)
const instant = name => timestamp(name, { withTimezone: true })
const createdAt = () => instant('created_at').defaultNow().notNull()
const updatedAt = () => instant('updated_at').defaultNow().notNull().$onUpdate(() => new Date())

const admins = pgTable('admins', {
  id: id(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  deactivatedAt: instant('deactivated_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  check('admins_email_normalized', sql`${table.email} <> '' AND ${table.email} = lower(btrim(${table.email}))`),
])

const roles = pgTable('roles', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

const adminRoles = pgTable('admin_roles', {
  adminId: uuid('admin_id').notNull().references(() => admins.id),
  roleKey: text('role_key').notNull().references(() => roles.key),
  createdAt: createdAt(),
}, table => [
  primaryKey({ columns: [table.adminId, table.roleKey] }),
  index('admin_roles_role_idx').on(table.roleKey),
])

const rolePermissions = pgTable('role_permissions', {
  roleKey: text('role_key').notNull().references(() => roles.key),
  permissionKey: text('permission_key').notNull().references(() => permissions.key),
  createdAt: createdAt(),
}, table => [
  primaryKey({ columns: [table.roleKey, table.permissionKey] }),
  index('role_permissions_permission_idx').on(table.permissionKey),
])

const presenters = pgTable('presenters', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio'),
  imagePath: text('image_path'),
  archivedAt: instant('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

const programmes = pgTable('programmes', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  imagePath: text('image_path'),
  archivedAt: instant('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

const scheduleSeries = pgTable('schedule_series', {
  id: id(),
  programmeId: uuid('programme_id').notNull().references(() => programmes.id),
  presenterId: uuid('presenter_id').notNull().references(() => presenters.id),
  kind: text('kind', { enum: ['one-time', 'weekly'] }).notNull(),
  publicationStatus: text('publication_status', { enum: ['draft', 'published'] }).default('draft').notNull(),
  startsOn: date('starts_on').notNull(),
  startTime: time('start_time', { precision: 0 }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  // Bit 0 is Monday and bit 6 is Sunday. Only weekly schedules have a mask or end date.
  weekdays: integer('weekdays'),
  endsOn: date('ends_on'),
  archivedAt: instant('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  check('schedule_series_kind', sql`
    (${table.kind} = 'one-time' AND ${table.weekdays} IS NULL AND ${table.endsOn} IS NULL)
    OR (${table.kind} = 'weekly' AND ${table.weekdays} IS NOT NULL AND ${table.weekdays} BETWEEN 1 AND 127
      AND (${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}))
  `),
  check('schedule_series_publication_status', sql`${table.publicationStatus} IN ('draft', 'published')`),
  check('schedule_series_duration_positive', sql`${table.durationMinutes} > 0`),
  check('schedule_series_start_time', sql`${table.startTime} < TIME '24:00'`),
  index('schedule_series_published_dates_idx').on(table.startsOn, table.endsOn)
    .where(sql`${table.publicationStatus} = 'published' AND ${table.archivedAt} IS NULL`),
  index('schedule_series_programme_idx').on(table.programmeId),
  index('schedule_series_presenter_idx').on(table.presenterId),
])

const scheduleExceptions = pgTable('schedule_exceptions', {
  seriesId: uuid('series_id').notNull().references(() => scheduleSeries.id),
  occurrenceDate: date('occurrence_date').notNull(),
  action: text('action', { enum: ['cancel', 'override'] }).notNull(),
  startsOn: date('starts_on'),
  startTime: time('start_time', { precision: 0 }),
  durationMinutes: integer('duration_minutes'),
  presenterId: uuid('presenter_id').references(() => presenters.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  primaryKey({ columns: [table.seriesId, table.occurrenceDate] }),
  check('schedule_exceptions_action', sql`
    (${table.action} = 'cancel' AND num_nonnulls(${table.startsOn}, ${table.startTime}, ${table.durationMinutes}, ${table.presenterId}) = 0)
    OR (${table.action} = 'override' AND num_nonnulls(${table.startsOn}, ${table.startTime}, ${table.durationMinutes}, ${table.presenterId}) > 0)
  `),
  check('schedule_exceptions_duration_positive', sql`${table.durationMinutes} > 0`),
  check('schedule_exceptions_start_time', sql`${table.startTime} < TIME '24:00'`),
  index('schedule_exceptions_start_date_idx').on(table.startsOn),
  index('schedule_exceptions_presenter_idx').on(table.presenterId),
])

const chatSessions = pgTable('chat_sessions', {
  id: id(),
  displayName: text('display_name').notNull(),
  createdAt: createdAt(),
  lastSeenAt: instant('last_seen_at').defaultNow().notNull(),
}, table => [
  check('chat_sessions_display_name_present', sql`btrim(${table.displayName}) <> ''`),
])

const chatMessages = pgTable('chat_messages', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id),
  body: text('body').notNull(),
  createdAt: createdAt(),
  deletedAt: instant('deleted_at'),
  deletedBy: uuid('deleted_by').references(() => admins.id),
}, table => [
  check('chat_messages_body_present', sql`btrim(${table.body}) <> ''`),
  check('chat_messages_deletion', sql`(${table.deletedAt} IS NULL) = (${table.deletedBy} IS NULL)`),
  index('chat_messages_history_idx').on(table.createdAt, table.id).where(sql`${table.deletedAt} IS NULL`),
  index('chat_messages_created_at_idx').on(table.createdAt),
  index('chat_messages_session_idx').on(table.sessionId),
])

const mutedUsers = pgTable('muted_users', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id),
  adminId: uuid('admin_id').notNull().references(() => admins.id),
  reason: text('reason'),
  createdAt: createdAt(),
  expiresAt: instant('expires_at'),
  revokedAt: instant('revoked_at'),
}, table => [
  check('muted_users_expiration', sql`${table.expiresAt} > ${table.createdAt}`),
  check('muted_users_revocation', sql`${table.revokedAt} >= ${table.createdAt}`),
  index('muted_users_session_idx').on(table.sessionId, table.expiresAt),
])

const stationSettings = pgTable('station_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

const adminActivityLogs = pgTable('admin_activity_logs', {
  id: id(),
  adminId: uuid('admin_id').notNull().references(() => admins.id),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: createdAt(),
}, table => [
  index('admin_activity_logs_admin_idx').on(table.adminId, table.createdAt),
  index('admin_activity_logs_resource_idx').on(table.resource, table.resourceId, table.createdAt),
])

module.exports = {
  admins, roles, permissions, adminRoles, rolePermissions, presenters, programmes, scheduleSeries,
  scheduleExceptions, chatSessions, chatMessages, mutedUsers, stationSettings, adminActivityLogs,
}
