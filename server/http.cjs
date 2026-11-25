const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const express = require('express')
const { stationSettings } = require('./schema.cjs')
const { createStreamStatus } = require('./stream.cjs')
const { publicSchedule } = require('./schedule-data.cjs')

function createApp({ config, database, frontend }) {
  const app = express()
  const bootId = randomUUID()
  const getStreamStatus = createStreamStatus(config)
  const streamOrigin = new URL(config.icecastStreamUrl).origin
  app.disable('x-powered-by')

  app.use((_request, response, next) => {
    response.set({
      'Content-Security-Policy': `default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; media-src 'self' ${streamOrigin}`,
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
  api.get('/schedule', async (_request, response) => {
    if (database) {
      try {
        return response.json(await publicSchedule(database.db, config.stationTimezone))
      } catch (error) {
        console.error('Schedule read failed', error.cause?.code ?? error.code ?? 'unknown')
      }
    }
    response.status(503).json({ status: 'unavailable' })
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
  app.get(['/', '/index.html'], (_request, response, next) => {
    response.sendFile(join(frontend, 'index.html'), error => {
      if (error?.code === 'ENOENT') {
        return response.status(503).type('text').send('Frontend build unavailable')
      }
      if (error) next(error)
    })
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
