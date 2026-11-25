const { readConfig } = require('../server/config.cjs')
const { connectDatabase } = require('../server/database.cjs')
const { pruneChat } = require('../server/chat-data.cjs')
const { createChatModerator } = require('../server/chat-moderation.cjs')
const { ChatError } = require('../server/chat-input.cjs')
const { ScheduleError } = require('../server/schedule-input.cjs')

const usage = `Usage from a trusted terminal with database access
  npm run chat:manage -- <admin-email> recent
  npm run chat:manage -- <admin-email> delete <message-id>
  npm run chat:manage -- <admin-email> mute <session-id> <minutes|permanent> [reason]
  npm run chat:manage -- <admin-email> unmute <session-id>
  npm run chat:manage -- prune`

const argumentCounts = { recent: [0], delete: [1], mute: [2, 3], unmute: [1] }

async function main([actor, action, ...args]) {
  if (!actor || actor === '--help') {
    console.log(usage)
    return
  }
  const prune = actor === 'prune' && action === undefined
  if (!prune && (!Object.hasOwn(argumentCounts, action) || !argumentCounts[action].includes(args.length))) {
    throw new ScheduleError(usage)
  }
  const config = readConfig()
  if (!config.databaseUrl) throw new ScheduleError('Set DATABASE_URL for the CYI Radio database.')
  const { db, pool } = connectDatabase(config.databaseUrl)
  try {
    const result = prune ? await pruneChat(db, config.chatRetentionDays)
      : await createChatModerator(db, actor)[action](...args)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await pool.end()
  }
}

main(process.argv.slice(2)).catch(error => {
  if (error instanceof ChatError || error instanceof ScheduleError) console.error(error.message)
  else console.error('Chat command failed', error.cause?.code ?? error.code ?? 'unknown')
  process.exitCode = 1
})
