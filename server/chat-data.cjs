const { createHash, randomBytes } = require('node:crypto')
const { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql } = require('drizzle-orm')
const { chatMessages, chatSessions, mutedUsers } = require('./schema.cjs')
const { ChatError, chatId, chatText, limits, readCursor } = require('./chat-input.cjs')

const duplicateWindowMs = 30_000
const rateWindowMs = 12_000
const minimumGapMs = 1_250
const sendsPerWindow = 5

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function retainFrom(days, now = new Date()) {
  return new Date(now.getTime() - days * 86_400_000)
}

function chatWrite(db, change) {
  return db.transaction(async tx => {
    // Readers advance by revision. Hold the lock so commits follow revision order.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(434721, 3)`)
    return change(tx)
  }, { isolationLevel: 'read committed' })
}

async function nextChatRevision(db) {
  const { rows: [row] } = await db.execute(sql`SELECT nextval('chat_messages_revision_seq')::text AS revision`)
  return BigInt(row.revision)
}

function activeMute(sessionId, now) {
  return and(eq(mutedUsers.sessionId, sessionId), isNull(mutedUsers.revokedAt),
    or(isNull(mutedUsers.expiresAt), gt(mutedUsers.expiresAt, now)))
}

async function findSession(db, token) {
  if (!token) return null
  const [session] = await db.select({ id: chatSessions.id, displayName: chatSessions.displayName })
    .from(chatSessions).where(eq(chatSessions.tokenHash, hashToken(token)))
  return session ?? null
}

async function joinChat(db, token, name) {
  const session = await findSession(db, token)
  if (session) return { session, token, created: false }

  const displayName = chatText(name, 'display name', 2, limits.name)
  const newToken = randomBytes(32).toString('base64url')
  const [created] = await db.insert(chatSessions).values({ displayName, tokenHash: hashToken(newToken) })
    .returning({ id: chatSessions.id, displayName: chatSessions.displayName })
  return { session: created, token: newToken, created: true }
}

function enforceMessageLimits(recent, body, now) {
  const latest = recent[0]
  if (latest && now - latest.createdAt < minimumGapMs) {
    throw new ChatError(429, 'rate-limited', 'Wait a moment before sending another message.', { retryAfter: 2 })
  }
  const withinWindow = recent.filter(row => now - row.createdAt < rateWindowMs)
  if (withinWindow.length >= sendsPerWindow) {
    const remaining = rateWindowMs - (now - withinWindow[sendsPerWindow - 1].createdAt)
    throw new ChatError(429, 'rate-limited', 'Wait a moment before sending another message.',
      { retryAfter: Math.max(1, Math.ceil(remaining / 1000)) })
  }
  if (recent.some(row => row.body.toLowerCase() === body.toLowerCase())) {
    throw new ChatError(429, 'duplicate-message', 'Please avoid repeating the same message.', { retryAfter: 30 })
  }
}

async function sendMessage(db, token, input) {
  if (!token) throw new ChatError(401, 'join-required', 'Join the chat to send a message.')
  const id = chatId(input?.id)
  const body = chatText(input?.body, 'message', 1, limits.message)

  return chatWrite(db, async tx => {
    const session = await findSession(tx, token)
    if (!session) throw new ChatError(401, 'join-required', 'Join the chat to send a message.')
    const now = new Date()
    const [existing] = await tx.select({ sessionId: chatMessages.sessionId, body: chatMessages.body })
      .from(chatMessages).where(eq(chatMessages.id, id))
    if (existing) {
      if (existing.sessionId === session.id && existing.body === body) return false
      throw new ChatError(409, 'message-conflict', 'Send this message again with a fresh draft.')
    }

    const [mute] = await tx.select({ expiresAt: mutedUsers.expiresAt }).from(mutedUsers)
      .where(activeMute(session.id, now)).orderBy(desc(mutedUsers.createdAt)).limit(1)
    if (mute) {
      throw new ChatError(403, 'muted', 'This chat session is muted.', { expiresAt: mute.expiresAt })
    }

    const recent = await tx.select({ body: chatMessages.body, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, session.id),
        gte(chatMessages.createdAt, new Date(now.getTime() - duplicateWindowMs))))
      .orderBy(desc(chatMessages.position)).limit(32)
    enforceMessageLimits(recent, body, now)
    const revision = await nextChatRevision(tx)
    await tx.insert(chatMessages).values({ id, sessionId: session.id, body, createdAt: now, position: revision, revision })
    await tx.update(chatSessions).set({ lastSeenAt: now }).where(eq(chatSessions.id, session.id))
    return true
  })
}

const publicColumns = {
  id: chatMessages.id, position: chatMessages.position, revision: chatMessages.revision,
  body: chatMessages.body, createdAt: chatMessages.createdAt, deletedAt: chatMessages.deletedAt,
  displayName: chatSessions.displayName,
}

function publicMessage({ id, position, body, createdAt, displayName }) {
  return { id, position: position.toString(), body, createdAt, displayName }
}

async function getHistory(db, retainedFrom, { before, after }) {
  if (before !== undefined && after !== undefined) {
    throw new ChatError(400, 'invalid-cursor', 'Choose either earlier messages or new changes.')
  }
  if (after !== undefined) {
    const cursor = readCursor(after, 0n)
    const rows = await db.select(publicColumns).from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(gt(chatMessages.revision, cursor), gte(chatMessages.createdAt, retainedFrom)))
      .orderBy(chatMessages.revision).limit(limits.page + 1)
    const page = rows.slice(0, limits.page)
    return {
      changes: page.map(row => row.deletedAt ? { id: row.id, removed: true } : publicMessage(row)),
      cursor: (page.at(-1)?.revision ?? cursor).toString(),
      hasMore: rows.length > limits.page,
      retainedFrom,
    }
  }

  const earlier = before === undefined ? null : readCursor(before, 1n)
  return db.transaction(async tx => {
    const rows = await tx.select(publicColumns).from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(isNull(chatMessages.deletedAt), gte(chatMessages.createdAt, retainedFrom),
        earlier === null ? undefined : lt(chatMessages.position, earlier)))
      .orderBy(desc(chatMessages.position)).limit(limits.page + 1)
    const page = rows.slice(0, limits.page)
    const result = {
      messages: page.reverse().map(publicMessage),
      before: rows.length > limits.page ? page[0].position.toString() : null,
      retainedFrom,
    }
    if (earlier === null) {
      const [latest] = await tx.select({ revision: chatMessages.revision }).from(chatMessages)
        .where(gte(chatMessages.createdAt, retainedFrom)).orderBy(desc(chatMessages.revision)).limit(1)
      result.cursor = (latest?.revision ?? 0n).toString()
    }
    return result
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

async function pruneChat(db, days) {
  const cutoff = retainFrom(days)
  return chatWrite(db, async tx => {
    const oldMessages = tx.select({ id: chatMessages.id }).from(chatMessages)
      .where(lt(chatMessages.createdAt, cutoff)).orderBy(chatMessages.createdAt).limit(1_000)
    const removed = await tx.delete(chatMessages).where(inArray(chatMessages.id, oldMessages))
      .returning({ id: chatMessages.id })
    const oldMutes = tx.select({ id: mutedUsers.id }).from(mutedUsers)
      .where(or(lt(mutedUsers.expiresAt, cutoff), lt(mutedUsers.revokedAt, cutoff))).limit(1_000)
    const restrictions = await tx.delete(mutedUsers).where(inArray(mutedUsers.id, oldMutes))
      .returning({ id: mutedUsers.id })
    const oldSessions = tx.select({ id: chatSessions.id }).from(chatSessions)
      .where(and(lt(chatSessions.lastSeenAt, cutoff), sql`NOT EXISTS (
        SELECT 1 FROM ${chatMessages} WHERE ${chatMessages.sessionId} = ${chatSessions.id}
      )`, sql`NOT EXISTS (
        SELECT 1 FROM ${mutedUsers} WHERE ${mutedUsers.sessionId} = ${chatSessions.id}
      )`)).limit(1_000)
    const sessions = await tx.delete(chatSessions).where(inArray(chatSessions.id, oldSessions))
      .returning({ id: chatSessions.id })
    return { messages: removed.length, mutes: restrictions.length, sessions: sessions.length }
  })
}

module.exports = { activeMute, chatWrite, findSession, getHistory, joinChat, nextChatRevision, pruneChat, sendMessage }
