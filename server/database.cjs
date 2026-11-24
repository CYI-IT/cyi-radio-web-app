const { drizzle } = require('drizzle-orm/node-postgres')
const { Pool } = require('pg')
const { probeRecords } = require('./schema.cjs')

function connectDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the Phase 0 database')

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
  })
  pool.on('error', error => console.error('Idle PostgreSQL connection closed', error.code ?? 'unknown'))

  return { db: drizzle(pool), pool }
}

module.exports = { connectDatabase, probeRecords }
