const { readConfig } = require('../server/config.cjs')
const { connectDatabase } = require('../server/database.cjs')
const { AdminError } = require('../server/admin-actor.cjs')
const { bootstrapAdmin, recoverAdmin } = require('../server/admin-auth.cjs')
const { ScheduleError } = require('../server/schedule-input.cjs')

const usage = `Usage from a trusted terminal with database access
  npm run admin:manage -- bootstrap <email> <display-name>
  npm run admin:manage -- recover <email>`

async function main([command, email, displayName, ...extra]) {
  if (!command || command === '--help') return console.log(usage)
  const bootstrap = command === 'bootstrap' && email && displayName
  const recover = command === 'recover' && email && displayName === undefined
  if (!(bootstrap || recover) || extra.length) throw new AdminError(400, usage)

  const config = readConfig()
  const { db, pool } = connectDatabase(config.databaseUrl)
  try {
    const result = bootstrap
      ? await bootstrapAdmin(db, email, displayName, config)
      : await recoverAdmin(db, config, email)
    const link = result.passwordLink ?? result
    console.log('Open this one-time link within 30 minutes. Keep it private.')
    console.log(link.url)
  } finally {
    await pool.end()
  }
}

main(process.argv.slice(2)).catch(error => {
  if (error instanceof AdminError || error instanceof ScheduleError) console.error(error.message)
  else console.error('Administrator command failed', error.cause?.code ?? error.code ?? 'Check local configuration.')
  process.exitCode = 1
})
