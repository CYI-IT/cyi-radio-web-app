const express = require('express')
const { ChatError } = require('./chat-input.cjs')
const { findSession, getHistory, joinChat, sendMessage } = require('./chat-data.cjs')
const { createChatDay } = require('./chat-day.cjs')

const cookieName = 'cyi_chat'
const cookieLife = 30 * 86_400_000

function sameOrigin(request, config) {
  const origin = request.headers.origin
  if (!origin || request.headers['sec-fetch-site'] === 'cross-site') return false
  if (config.production) return origin === config.publicAppUrl
  return origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`
}

function chatToken(request) {
  for (const cookie of request.headers.cookie?.split(';') ?? []) {
    const [name, value] = cookie.trim().split('=', 2)
    if (name === cookieName && /^[A-Za-z0-9_-]{43}$/.test(value ?? '')) return value
  }
  return null
}

function connectionBudget(maximum, windowMs) {
  const budgets = new WeakMap()
  return (request, _response, next) => {
    const now = Date.now()
    const socket = request.socket
    let budget = budgets.get(socket)
    if (!budget || budget.expiresAt <= now) {
      budget = { count: 0, expiresAt: now + windowMs }
      budgets.set(socket, budget)
    }
    if (budget.count >= maximum) {
      throw new ChatError(429, 'connection-rate-limited', 'Too many chat requests. Try again shortly.',
        { retryAfter: Math.ceil((budget.expiresAt - now) / 1000) })
    }
    budget.count++
    next()
  }
}

function chatRouter({ config, database, realtime, notify }) {
  const router = express.Router()
  const joinBudget = connectionBudget(24, 60_000)
  const sendBudget = connectionBudget(24, 12_000)
  const db = database?.db
  const stationChatDay = createChatDay(config.stationTimezone)
  const listenerDays = new Map()

  function resolveChatDay(timezone) {
    if (timezone === undefined) return stationChatDay
    if (typeof timezone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/.test(timezone)) {
      throw new ChatError(400, 'invalid-timezone', 'Use a valid chat timezone.')
    }
    if (listenerDays.has(timezone)) return listenerDays.get(timezone)
    let chatDay
    try {
      chatDay = createChatDay(timezone)
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      throw new ChatError(400, 'invalid-timezone', 'Use a valid chat timezone.')
    }
    if (listenerDays.size >= 64) listenerDays.delete(listenerDays.keys().next().value)
    listenerDays.set(timezone, chatDay)
    return chatDay
  }
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.production,
    maxAge: cookieLife, path: '/api/v1/chat' }

  router.use((_request, _response, next) => {
    if (!db) throw new ChatError(503, 'unavailable', 'Chat is temporarily unavailable.')
    next()
  })

  const sameOriginJson = [(request, _response, next) => {
    if (!sameOrigin(request, config)) {
      throw new ChatError(403, 'origin-denied', 'Open the radio page to use chat.')
    }
    if (!request.is('application/json')) {
      throw new ChatError(415, 'json-required', 'Send a JSON chat request.')
    }
    next()
  }, express.json({ limit: '4kb' })]

  router.get('/session', async (request, response) => {
    const token = chatToken(request)
    const session = await findSession(db, token)
    if (session) response.cookie(cookieName, token, cookieOptions)
    response.json({ session: session ? { displayName: session.displayName } : null, realtime })
  })

  router.post('/session', joinBudget, sameOriginJson, async (request, response) => {
    const result = await joinChat(db, chatToken(request), request.body?.displayName)
    response.cookie(cookieName, result.token, cookieOptions)
    response.status(result.created ? 201 : 200).json({ session: { displayName: result.session.displayName }, realtime })
  })

  router.get('/messages', async (request, response) => {
    const currentChatDay = resolveChatDay(request.query.timezone)
    let day = currentChatDay()
    let history = await getHistory(db, new Date(day.start), request.query)
    if (Date.now() >= day.end) {
      day = currentChatDay()
      history = await getHistory(db, new Date(day.start), request.query)
    }
    response.json({ ...history, resetAfterMs: Math.max(0, day.end - Date.now()) })
  })

  router.post('/messages', sendBudget, sameOriginJson, async (request, response) => {
    const created = await sendMessage(db, chatToken(request), request.body)
    if (created) notify()
    response.status(created ? 201 : 200).json({ accepted: true })
  })

  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof ChatError) {
      if (error.details.retryAfter) response.set('Retry-After', String(error.details.retryAfter))
      return response.status(error.status).json({ code: error.code, message: error.message, ...error.details })
    }
    if (error.status === 400 || error.status === 413) {
      return response.status(error.status).json({ code: 'invalid-request', message: 'Check the chat request and try again.' })
    }
    console.error('Chat request failed', error.cause?.code ?? error.code ?? 'unknown')
    response.status(503).json({ code: 'unavailable', message: 'Chat is temporarily unavailable.' })
  })
  return router
}

module.exports = { chatRouter, sameOrigin }
