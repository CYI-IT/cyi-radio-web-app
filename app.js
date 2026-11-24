const { createServer } = require('node:http')
const { join } = require('node:path')
const { readConfig } = require('./server/config.cjs')
const { connectDatabase } = require('./server/database.cjs')
const { createApp } = require('./server/http.cjs')

const config = readConfig()
const database = config.databaseUrl ? connectDatabase(config.databaseUrl) : null
const frontend = join(__dirname, 'dist')
const server = createServer(createApp({ config, database, frontend }))

server.listen(config.port)

function shutdown() {
  const timeout = setTimeout(() => {
    console.error('Application shutdown timed out')
    process.exit(1)
  }, 10_000)
  timeout.unref()

  server.close(async error => {
    try {
      if (error) throw error
      await database?.pool.end()
    } catch (shutdownError) {
      console.error('Application shutdown failed', shutdownError.code ?? 'unknown')
      process.exitCode = 1
    } finally {
      clearTimeout(timeout)
    }
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
