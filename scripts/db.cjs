const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const { eq, getTableName } = require('drizzle-orm')
const { readMigrationFiles } = require('drizzle-orm/migrator')
const { drizzle } = require('drizzle-orm/node-postgres')
const { migrate } = require('drizzle-orm/node-postgres/migrator')
const { connectDatabase } = require('../server/database.cjs')
const schema = require('../server/schema.cjs')
const journal = require('../migrations/meta/_journal.json')

const migrationConfig = { migrationsFolder: join(__dirname, '..', 'migrations') }
const rollback = new Error('Rollback permission check')

async function verifyDatabase(db, pool) {
  const { stationSettings } = schema
  const tableNames = Object.values(schema).map(getTableName)
  const { rows: missing } = await pool.query(`
    SELECT name FROM unnest($1::text[]) AS tables(name)
    WHERE to_regclass('public.' || name) IS NULL
  `, [tableNames])
  if (missing.length) {
    console.error('Missing application tables:', missing.map(row => row.name).join(', '))
    process.exitCode = 1
    return
  }

  const key = `db-verify-${randomUUID()}`
  const target = eq(stationSettings.key, key)

  try {
    await db.transaction(async tx => {
      await tx.insert(stationSettings).values({ key, value: { marker: 'created' } })
      const [created] = await tx.select().from(stationSettings).where(target)
      assert.deepEqual(created.value, { marker: 'created' })
      assert.ok(created.createdAt instanceof Date)

      const [updated] = await tx.update(stationSettings).set({ value: { marker: 'updated' } }).where(target).returning()
      assert.deepEqual(updated.value, { marker: 'updated' })
      const [deleted] = await tx.delete(stationSettings).where(target).returning()
      assert.equal(deleted.key, key)

      await tx.insert(stationSettings).values({ key, value: { marker: 'rollback' } })

      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }

  assert.equal((await db.select().from(stationSettings).where(target)).length, 0)
  console.log(`Verified ${tableNames.length} application tables and Drizzle CRUD. No test row retained.`)
}

async function readMigrationStatus(client, migrations) {
  const { rows: [server] } = await client.query(`
    SELECT current_setting('server_version') AS version,
      current_setting('server_version_num')::integer AS "versionNumber",
      has_database_privilege(current_database(), 'CONNECT') AS "canConnect",
      has_database_privilege(current_database(), 'CREATE') AS "canCreateSchema",
      has_schema_privilege('public', 'CREATE') AS "canCreatePublicTable",
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS "hasJournal",
      to_regclass('public.phase0_probe_records') IS NOT NULL AS "hasPhase0Probe"
  `)

  const { rows: applied } = server.hasJournal
    ? await client.query('SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at')
    : { rows: [] }

  const status = migrations.map(({ folderMillis, hash }, index) => {
    const matches = applied.filter(row => Number(row.created_at) === folderMillis)
    let state = 'pending'
    if (matches.length > 0) state = matches.length === 1 && matches[0].hash === hash ? 'applied' : 'mismatch'
    else if (applied.some(row => Number(row.created_at) > folderMillis)) state = 'missing-from-journal'
    return { name: journal.entries[index].tag, state }
  })
  const unexpectedEntries = applied.filter(row =>
    !migrations.some(file => file.folderMillis === Number(row.created_at)),
  ).length

  return { ...server, migrations: status, unexpectedEntries }
}

function hasIncompatibleHistory(status) {
  return status.hasPhase0Probe || status.unexpectedEntries > 0 ||
    status.migrations.some(({ state }) => state === 'mismatch' || state === 'missing-from-journal')
}

function printStatus(status) {
  console.log(JSON.stringify(status, null, 2))
}

async function applyMigrations(pool, migrations) {
  const lockKeys = [434721, 1]
  const client = await pool.connect()
  let locked = false
  try {
    const { rows: [lock] } = await client.query('SELECT pg_try_advisory_lock($1, $2) AS locked', lockKeys)
    locked = lock.locked
    if (!locked) {
      console.error('Another CYI Radio migration is already running on this database.')
      process.exitCode = 1
      return
    }

    const before = await readMigrationStatus(client, migrations)
    if (hasIncompatibleHistory(before)) {
      printStatus(before)
      console.error('Migration refused. Check the database and its migration history.')
      process.exitCode = 1
      return
    }

    if (before.migrations.some(({ state }) => state === 'pending')) {
      // Use the lock-holding connection for the migration transaction as well.
      await migrate(drizzle(client), migrationConfig)
    }
    const after = await readMigrationStatus(client, migrations)
    printStatus(after)
    if (hasIncompatibleHistory(after) || after.migrations.some(({ state }) => state !== 'applied')) {
      process.exitCode = 1
    }
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1, $2)', lockKeys)
    } finally {
      client.release()
    }
  }
}

async function main() {
  const command = process.argv[2]
  if (!['inspect', 'migrate', 'status', 'verify'].includes(command)) {
    console.error('Use inspect, migrate, status or verify.')
    process.exitCode = 1
    return
  }

  const migrations = readMigrationFiles(migrationConfig)
  if (command === 'inspect') {
    for (const [index, migration] of migrations.entries()) {
      console.log(`\n-- ${journal.entries[index].tag}.sql (${migration.hash})\n${migration.sql.join('--> statement-breakpoint')}`)
    }
    return
  }

  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL for the CYI Radio database.')
    process.exitCode = 1
    return
  }
  const { db, pool } = connectDatabase()
  try {
    if (command === 'migrate') {
      await applyMigrations(pool, migrations)
      return
    }

    const status = await readMigrationStatus(pool, migrations)
    if (command === 'status') printStatus(status)
    if (hasIncompatibleHistory(status)) {
      console.error('Check the database and its migration history.')
      process.exitCode = 1
    } else if (command === 'verify') {
      if (status.migrations.some(({ state }) => state === 'pending')) {
        console.error('Apply the pending migrations before verifying the schema.')
        process.exitCode = 1
      } else {
        await verifyDatabase(db, pool)
      }
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
