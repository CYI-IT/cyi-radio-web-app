const express = require('express')
const { eq } = require('drizzle-orm')
const { adminSessions } = require('./schema.cjs')
const { AdminError, adminPermissions, authorizeAdmin, findAdminSession } = require('./admin-actor.cjs')
const { sessionHash, sessionLifetime, setPassword, signIn } = require('./admin-auth.cjs')
const { createAdminManager, readAuditLog, readStationSettings, updateStationSettings } = require('./admin-management.cjs')
const { createScheduleManager } = require('./schedule-management.cjs')
const { createChatModerator } = require('./chat-moderation.cjs')
const { ScheduleError } = require('./schedule-input.cjs')
const { ChatError } = require('./chat-input.cjs')

function adminRouter({ config, database, notify }) {
  const router = express.Router()
  const db = database?.db
  const cookieName = config.production ? '__Host-cyi-admin' : 'cyi_admin'
  const cookie = { httpOnly: true, sameSite: 'strict', secure: config.production, path: '/' }

  function readSession(request) {
    const prefix = `${cookieName}=`
    const cookies = request.headers.cookie?.split(';').map(value => value.trim()) ?? []
    const matches = cookies.filter(part => part.startsWith(prefix))
    return matches.length === 1 ? sessionHash(config.sessionSecret, matches[0].slice(prefix.length)) : null
  }

  router.use((request, response, next) => {
    response.set('Referrer-Policy', 'no-referrer')
    if (!db || !config.sessionSecret) throw new AdminError(503, 'Administration is temporarily unavailable.')
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (request.get('origin') !== config.publicAppUrl || request.get('sec-fetch-site') === 'cross-site') {
        throw new AdminError(403, 'Open the administration page to make changes.')
      }
      if (!request.is('application/json')) throw new AdminError(415, 'Send a JSON request.')
    }
    request.adminIdentity = { sessionHash: readSession(request) }
    next()
  })
  router.use(express.json({ limit: '12kb' }))

  router.post('/login', async (request, response) => {
    const token = await signIn(db, config.sessionSecret, request.body, request.adminIdentity.sessionHash)
    response.cookie(cookieName, token, { ...cookie, maxAge: sessionLifetime })
    response.json({ signedIn: true })
  })

  router.post('/password', async (request, response) => {
    await setPassword(db, config.sessionSecret, request.body, request.adminIdentity.sessionHash)
    response.clearCookie(cookieName, cookie).json({ updated: true })
  })

  router.post('/logout', async (request, response) => {
    const hash = request.adminIdentity.sessionHash
    if (hash) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hash))
    response.clearCookie(cookieName, cookie).json({ signedIn: false })
  })

  router.use((request, _response, next) => {
    if (!request.adminIdentity.sessionHash) throw new AdminError(401, 'Sign in to continue.')
    next()
  })

  router.get('/session', async (request, response) => {
    const admin = await findAdminSession(db, request.adminIdentity.sessionHash)
    if (!admin) throw new AdminError(401, 'Sign in to continue.')
    const permissions = await adminPermissions(db, admin.id)
    response.json({ ...admin, permissions: [...permissions].sort() })
  })

  const manager = request => createAdminManager(db, config, request.adminIdentity)
  router.get('/accounts', async (request, response) => response.json(await manager(request).list()))
  router.post('/accounts', async (request, response) =>
    response.status(201).json(await manager(request).create(request.body)))
  router.patch('/accounts/:id', async (request, response) =>
    response.json(await manager(request).update(request.params.id, request.body)))
  router.post('/accounts/:id/password-link', async (request, response) =>
    response.json(await manager(request).passwordLink(request.params.id)))

  router.get('/audit', async (request, response) =>
    response.json(await readAuditLog(db, request.adminIdentity, request.query.before)))

  router.get('/settings', async (request, response) => {
    await authorizeAdmin(db, request.adminIdentity, ['settings.manage'])
    response.json(await readStationSettings(db))
  })
  router.patch('/settings', async (request, response) =>
    response.json(await updateStationSettings(db, request.adminIdentity, request.body)))

  const schedule = request => createScheduleManager(db, request.adminIdentity)
  for (const resource of ['programmes', 'presenters', 'series']) {
    router.get(`/${resource}`, async (request, response) => response.json(await schedule(request)[resource].list()))
    router.post(`/${resource}`, async (request, response) =>
      response.status(201).json(await schedule(request)[resource].create(request.body)))
    router.patch(`/${resource}/:id`, async (request, response) =>
      response.json(await schedule(request)[resource].update(request.params.id, request.body)))
    router.delete(`/${resource}/:id`, async (request, response) =>
      response.json(await schedule(request)[resource].archive(request.params.id)))
  }
  router.put('/series/:id/exceptions/:day', async (request, response) =>
    response.json(await schedule(request).exceptions.set(request.params.id, request.params.day, request.body)))
  router.delete('/series/:id/exceptions/:day', async (request, response) => {
    await schedule(request).exceptions.remove(request.params.id, request.params.day, request.body)
    response.json({ removed: true })
  })

  const moderator = request => createChatModerator(db, request.adminIdentity)
  router.get('/messages', async (request, response) => response.json(await moderator(request).recent()))
  router.get('/mutes', async (request, response) => response.json(await moderator(request).mutes()))
  router.delete('/messages/:id', async (request, response) => {
    const result = await moderator(request).delete(request.params.id)
    if (result.deleted) notify()
    response.json(result)
  })
  router.put('/mutes/:id', async (request, response) =>
    response.json(await moderator(request).mute(request.params.id, request.body?.duration, request.body?.reason)))
  router.delete('/mutes/:id', async (request, response) =>
    response.json(await moderator(request).unmute(request.params.id)))

  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof AdminError || error instanceof ChatError) {
      if (error.retryAfter) response.set('Retry-After', String(error.retryAfter))
      return response.status(error.status).json({ message: error.message })
    }
    if (error instanceof ScheduleError) return response.status(400).json({ message: error.message, ...error.details })
    if (error.status === 400 || error.status === 413) {
      return response.status(error.status).json({ message: 'Check the request and try again.' })
    }
    const code = error.cause?.code ?? error.code
    if (code === '23505') return response.status(409).json({ message: 'A record with this identifier already exists.' })
    console.error('Administration request failed', code ?? 'unknown')
    response.status(503).json({ message: 'Administration is temporarily unavailable.' })
  })
  return router
}

module.exports = { adminRouter }
