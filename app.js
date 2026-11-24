const { randomUUID } = require('node:crypto')
const { createServer } = require('node:http')
const { join } = require('node:path')
const express = require('express')
const { Server } = require('socket.io')
const { connectDatabase, probeRecords } = require('./server/database.cjs')

const app = express()
const server = createServer(app)
const io = new Server(server, { maxHttpBufferSize: 1024, serveClient: false })
const bootId = randomUUID()
const database = process.env.DATABASE_URL ? connectDatabase() : null
const assets = join(__dirname, 'dist')

app.disable('x-powered-by')
app.use('/api/v1', (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})
app.get('/api/v1/health', (_request, response) => {
  response.json({ status: 'ok', node: process.versions.node, bootId })
})
app.get('/api/v1/ready', async (_request, response) => {
  try {
    if (!database) throw new Error('Database configuration missing')
    await database.db.select({ id: probeRecords.id }).from(probeRecords).limit(1)
    response.json({ status: 'ready' })
  } catch {
    response.status(503).json({ status: 'unavailable' })
  }
})
app.use('/api/v1', (_request, response) => response.status(404).json({ status: 'not-found' }))
app.use(express.static(assets, { setHeaders: response => response.setHeader('X-Content-Type-Options', 'nosniff') }))

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
io.on('connection', socket => {
  let lastPing = 0
  socket.on('phase0:ping', (id, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    if (typeof id !== 'string' || !uuid.test(id)) {
      acknowledge({ ok: false, reason: 'invalid-id' })
      return
    }

    const now = Date.now()
    if (now - lastPing < 1000) {
      acknowledge({ ok: false, reason: 'rate-limited' })
      return
    }

    lastPing = now
    io.emit('phase0:delivery', { id, bootId })
    acknowledge({ ok: true })
  })
})

const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a TCP port number')
server.listen(port)

function shutdown() {
  io.close(async () => {
    await database?.pool.end()
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
