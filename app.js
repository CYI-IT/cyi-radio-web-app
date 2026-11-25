const { createServer } = require('node:http')
const { join } = require('node:path')
const { readConfig } = require('./server/config.cjs')
const { connectDatabase } = require('./server/database.cjs')
const { createApp } = require('./server/http.cjs')
const { attachChatSocket } = require('./server/chat-socket.cjs')

const config = readConfig()
const database = config.databaseUrl ? connectDatabase(config.databaseUrl) : null
const frontend = join(__dirname, 'dist')
const chatRealtime = Boolean(database) && config.chatTransport === 'socket.io'
const server = createServer(createApp({
  config, database, frontend, chatRealtime,
  onChatChange: () => chatSocket?.emit('chat:changed'),
}))
const chatSocket = chatRealtime ? attachChatSocket(server, config) : null

server.listen(config.port)

function shutdown() {
  const timeout = setTimeout(() => {
    console.error('Application shutdown timed out')
    process.exit(1)
  }, 10_000)
  timeout.unref()

  const close = chatSocket ? chatSocket.close.bind(chatSocket) : server.close.bind(server)
  close(async error => {
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
