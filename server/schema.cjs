const { pgTable, text, timestamp, uuid } = require('drizzle-orm/pg-core')

const probeRecords = pgTable('phase0_probe_records', {
  id: uuid('id').primaryKey(),
  marker: text('marker').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

module.exports = { probeRecords }
