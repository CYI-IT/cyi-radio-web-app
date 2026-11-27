const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const express = require('express')
const { stationSettings } = require('./schema.cjs')
const { createStreamStatus } = require('./stream.cjs')
const { publicSchedule } = require('./schedule-data.cjs')
const { date: scheduleDate } = require('./schedule-input.cjs')
const { chatRouter } = require('./chat-http.cjs')
const { adminRouter } = require('./admin-http.cjs')
const { readStationSettings } = require('./admin-management.cjs')

function createApp({ config, database, frontend, chatRealtime = false, onChatChange = () => {} }) {
  const app = express()
  const bootId = randomUUID()
  const getStreamStatus = createStreamStatus(config)
  const streamOrigin = new URL(config.icecastStreamUrl).origin
  const connectSources = chatRealtime ? `'self' ${config.publicAppUrl.replace(/^http/, 'ws')}` : "'self'"
  app.disable('x-powered-by')

  app.use((_request, response, next) => {
    response.set({
      'Content-Security-Policy': `default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; media-src 'self' ${streamOrigin}; connect-src ${connectSources}`,
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    if (config.production) response.set('Strict-Transport-Security', 'max-age=31536000')
    next()
  })

  const api = express.Router()
  api.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  api.get('/health', (_request, response) => {
    response.json({ status: 'ok', node: process.versions.node, bootId })
  })
  api.get('/stream', async (_request, response) => {
    response.json(await getStreamStatus())
  })
  api.get('/schedule', async (request, response) => {
    const { day, from, to } = request.query
    let range
    if (from !== undefined || to !== undefined) {
      try {
        range = { from: scheduleDate(from, 'from'), to: scheduleDate(to, 'to') }
      } catch (error) {
        return response.status(400).json({ status: 'request-error', message: error.message })
      }
      const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000
      if (day !== undefined || days < 1 || days > 31) {
        return response.status(400).json({ status: 'request-error', message: 'Supply a date range of 1 to 31 days without the day parameter.' })
      }
    }
    if (database) {
      try {
        return response.json(await publicSchedule(database.db, config.stationTimezone, new Date(), { today: day === 'today', range }))
      } catch (error) {
        console.error('Schedule read failed', error.cause?.code ?? error.code ?? 'unknown')
      }
    }
    response.status(503).json({ status: 'unavailable' })
  })
  api.use('/chat', chatRouter({ config, database, realtime: chatRealtime, notify: onChatChange }))
  api.use('/admin', adminRouter({ config, database, notify: onChatChange }))
  api.get('/station', async (_request, response) => {
    response.json(await readStationSettings(database?.db))
  })
  api.get('/ready', async (_request, response) => {
    if (database) {
      try {
        await database.db.select({ key: stationSettings.key }).from(stationSettings).limit(1)
        return response.json({ status: 'ready' })
      } catch (error) {
        console.error('Database readiness check failed', error.cause?.code ?? error.code ?? 'unknown')
      }
    }
    response.status(503).json({ status: 'unavailable' })
  })
  api.use((_request, response) => response.status(404).json({ status: 'not-found' }))
  app.use('/api/v1', api)

  app.use('/assets', express.static(join(frontend, 'assets'), {
    immutable: true,
    maxAge: '1y',
    index: false,
    redirect: false,
  }))
  function sendPage(name, response, next) {
    response.sendFile(join(frontend, name), error => {
      if (error?.code === 'ENOENT') {
        return response.status(503).type('text').send('Frontend build unavailable')
      }
      if (error) next(error)
    })
  }
  app.get(['/', '/index.html', '/schedule'], (_request, response, next) => sendPage('index.html', response, next))
  app.get('/manifest.webmanifest', (_request, response, next) => {
    response.set('Cache-Control', 'no-cache').type('application/manifest+json')
    sendPage('manifest.webmanifest', response, next)
  })
  app.get('/sw.js', (_request, response, next) => {
    response.set('Cache-Control', 'no-cache').type('text/javascript')
    sendPage('sw.js', response, next)
  })
  app.get('/admin', (_request, response, next) => {
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' })
    sendPage('admin.html', response, next)
  })
  app.use((_request, response) => response.status(404).type('text').send('Not found'))
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)
    const status = error.status >= 400 && error.status < 500 ? error.status : 500
    if (status === 500) console.error('HTTP request failed', error.code ?? 'unknown')
    if (request.path.startsWith('/api/v1/')) {
      return response.status(status).json({ status: status === 500 ? 'internal-error' : 'request-error' })
    }
    response.status(status).type('text').send(status === 500 ? 'Internal server error' : 'Request error')
  })

  return app
}

module.exports = { createApp }
