const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const { eq } = require('drizzle-orm')
const { readMigrationFiles } = require('drizzle-orm/migrator')
const { migrate } = require('drizzle-orm/node-postgres/migrator')
const { connectDatabase, probeRecords } = require('../server/database.cjs')
const journal = require('../migrations/meta/_journal.json')

const migrationConfig = { migrationsFolder: join(__dirname, '..', 'migrations') }
const rollback = new Error('Rollback permission check')

async function verifyDatabase(db) {
  const id = randomUUID()
  const target = eq(probeRecords.id, id)

  try {
    await db.transaction(async tx => {
      await tx.insert(probeRecords).values({ id, marker: 'created' })
      const [created] = await tx.select().from(probeRecords).where(target)
      assert.equal(created.marker, 'created')
      assert.ok(created.createdAt instanceof Date)

      const [updated] = await tx.update(probeRecords).set({ marker: 'updated' }).where(target).returning()
      assert.equal(updated.marker, 'updated')
      const [deleted] = await tx.delete(probeRecords).where(target).returning()
      assert.equal(deleted.id, id)

      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }

  assert.equal((await db.select().from(probeRecords).where(target)).length, 0)
  console.log('Verified Drizzle insert, select, update and delete. No test row retained.')
}

async function reportMigrationStatus(pool, migrations) {
  const { rows: [server] } = await pool.query(`
    SELECT current_setting('server_version') AS version,
      current_setting('server_version_num')::integer AS "versionNumber",
      has_database_privilege(current_database(), 'CONNECT') AS "canConnect",
      has_database_privilege(current_database(), 'CREATE') AS "canCreateSchema",
      has_schema_privilege('public', 'CREATE') AS "canCreatePublicTable",
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS "hasJournal"
  `)

  const { rows: applied } = server.hasJournal
    ? await pool.query('SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at')
    : { rows: [] }

  const status = migrations.map(({ folderMillis, hash }, index) => {
    const matches = applied.filter(row => Number(row.created_at) === folderMillis)
    let state = 'pending'
    if (matches.length > 0) state = matches.length === 1 && matches[0].hash === hash ? 'applied' : 'mismatch'
    return { name: journal.entries[index].tag, state }
  })
  const unexpectedEntries = applied.filter(row => !migrations.some(file => file.folderMillis === Number(row.created_at)))

  console.log(JSON.stringify({ ...server, migrations: status, unexpectedEntries: unexpectedEntries.length }, null, 2))
  if (unexpectedEntries.length || status.some(migration => migration.state === 'mismatch')) process.exitCode = 1
}

async function main() {
  const command = process.argv[2]
  const migrations = readMigrationFiles(migrationConfig)
  if (command === 'inspect') {
    for (const [index, migration] of migrations.entries()) {
      console.log(`\n-- ${journal.entries[index].tag}.sql (${migration.hash})\n${migration.sql.join('--> statement-breakpoint')}`)
    }
    return
  }

  const { db, pool } = connectDatabase()
  try {
    switch (command) {
      case 'migrate':
        await migrate(db, migrationConfig)
        await reportMigrationStatus(pool, migrations)
        break
      case 'status':
        await reportMigrationStatus(pool, migrations)
        break
      case 'verify':
        await verifyDatabase(db)
        break
      default:
        throw new Error('Use inspect, migrate, status or verify')
    }
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  const code = error.cause?.code ?? error.code
  console.error(code ? `Database check failed (${code})` : 'Database check failed. Check DATABASE_URL and the migration files.')
  process.exitCode = 1
})
