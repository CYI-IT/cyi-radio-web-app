const { readFileSync } = require('node:fs')
const { connectDatabase } = require('../server/database.cjs')
const { ScheduleError } = require('../server/schedule-input.cjs')
const { bootstrapScheduleAdmin, createScheduleManager } = require('../server/schedule-management.cjs')

const usage = `Usage from a trusted terminal with database access
  npm run schedule:manage -- bootstrap <email> <display-name>
  npm run schedule:manage -- <email> <programmes|presenters|series> list
  npm run schedule:manage -- <email> <programmes|presenters|series> <get|archive> <id>
  npm run schedule:manage -- <email> <programmes|presenters|series> create <json>
  npm run schedule:manage -- <email> <programmes|presenters|series> update <id> <json>
  npm run schedule:manage -- <email> exceptions set <series-id> <occurrence-date> <json>
  npm run schedule:manage -- <email> exceptions remove <series-id> <occurrence-date> [json]

Prefix a filename with @ to read its JSON.`

const argumentsFor = {
  list: [],
  get: ['value'],
  archive: ['value'],
  create: ['json'],
  update: ['value', 'json'],
  set: ['value', 'value', 'json'],
  remove: ['value', 'value', 'optionalJson'],
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf8') : raw)
  } catch {
    throw new ScheduleError('Supply valid JSON or @ followed by a readable JSON filename.')
  }
}

async function main([email, resource, action, ...args]) {
  if (!email || email === '--help') {
    console.log(usage)
    return
  }
  if (!process.env.DATABASE_URL) throw new ScheduleError('Set DATABASE_URL for the CYI Radio database.')
  const { db, pool } = connectDatabase()
  try {
    if (email === 'bootstrap') {
      if (!resource || !action || args.length) throw new ScheduleError(usage)
      console.log(JSON.stringify(await bootstrapScheduleAdmin(db, resource, action), null, 2))
      return
    }

    const manager = createScheduleManager(db, email)
    if (!Object.hasOwn(manager, resource) || !Object.hasOwn(manager[resource], action)) {
      throw new ScheduleError(usage)
    }
    const expected = argumentsFor[action]
    const required = expected.filter(argument => argument !== 'optionalJson').length
    if (args.length < required || args.length > expected.length) throw new ScheduleError(usage)

    const values = args.map((arg, index) => expected[index] === 'value' ? arg : parseJson(arg))
    const result = await manager[resource][action](...values)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await pool.end()
  }
}

main(process.argv.slice(2)).catch(error => {
  if (error instanceof ScheduleError) {
    console.error(error.message)
    if (error.details) console.error(JSON.stringify(error.details, null, 2))
  } else {
    const code = error.cause?.code ?? error.code
    console.error(code === '23505' ? 'A record with that slug already exists.'
      : `Schedule command failed${code ? ` (${code})` : ''}.`)
  }
  process.exitCode = 1
})
