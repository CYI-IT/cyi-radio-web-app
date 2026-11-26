const { and, desc, eq, isNull, sql } = require('drizzle-orm')
const { chatMessages, chatSessions, mutedUsers } = require('./schema.cjs')
const { authorizeAdmin, recordAdminAction } = require('./admin-actor.cjs')
const { emailAddress } = require('./schedule-input.cjs')
const { ChatError, chatId, chatText } = require('./chat-input.cjs')
const { activeMute, chatWrite, nextChatRevision } = require('./chat-data.cjs')

function createChatModerator(db, identity) {
  const actorIdentity = typeof identity === 'string' ? emailAddress(identity) : identity
  const authorize = (tx, lock) => authorizeAdmin(tx, actorIdentity, ['chat.moderate'], lock)
  const write = action => chatWrite(db, async tx => action(tx, await authorize(tx, true)))

  return {
    async recent() {
      await authorize(db)
      return db.select({
        id: chatMessages.id, sessionId: chatMessages.sessionId, displayName: chatSessions.displayName,
        body: chatMessages.body, createdAt: chatMessages.createdAt,
      }).from(chatMessages).innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
        .where(isNull(chatMessages.deletedAt)).orderBy(desc(chatMessages.position)).limit(30)
    },

    async mutes() {
      await authorize(db)
      return db.select({ id: mutedUsers.id, sessionId: chatSessions.id, displayName: chatSessions.displayName,
        reason: mutedUsers.reason, expiresAt: mutedUsers.expiresAt })
        .from(mutedUsers).innerJoin(chatSessions, eq(chatSessions.id, mutedUsers.sessionId))
        .where(activeMute(chatSessions.id, sql`clock_timestamp()`)).orderBy(desc(mutedUsers.createdAt))
    },

    delete(id) {
      const messageId = chatId(id)
      return write(async (tx, actor) => {
        const [message] = await tx.select({ sessionId: chatMessages.sessionId, deletedAt: chatMessages.deletedAt })
          .from(chatMessages).where(eq(chatMessages.id, messageId))
        if (!message) throw new ChatError(404, 'missing-message', 'The message does not exist.')
        if (message.deletedAt) return { id: messageId, deleted: false }

        const revision = await nextChatRevision(tx)
        await tx.update(chatMessages).set({ revision, deletedAt: new Date(), deletedBy: actor.id })
          .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
        await recordAdminAction(tx, actor, 'delete', 'chat_message', messageId, { sessionId: message.sessionId })
        return { id: messageId, deleted: true }
      })
    },

    mute(id, duration, note) {
      const sessionId = chatId(id, 'session ID')
      const minutes = duration === 'permanent' ? null : Number(duration)
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 525_600)) {
        throw new ChatError(400, 'invalid-duration', 'Choose permanent or a whole number of minutes from 1 to 525600.')
      }
      const reason = note === undefined ? null : chatText(note, 'mute reason', 1, 500)
      return write(async (tx, actor) => {
        const [session] = await tx.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.id, sessionId))
        if (!session) throw new ChatError(404, 'missing-session', 'The chat session does not exist.')

        const now = new Date()
        const expiresAt = minutes === null ? null : new Date(now.getTime() + minutes * 60_000)
        await tx.update(mutedUsers).set({ revokedAt: now }).where(activeMute(sessionId, now))
        const [restriction] = await tx.insert(mutedUsers).values({
          sessionId, adminId: actor.id, reason, createdAt: now, expiresAt,
        }).returning({ id: mutedUsers.id })
        await recordAdminAction(tx, actor, 'mute', 'chat_session', sessionId, { muteId: restriction.id, expiresAt, reason })
        return { sessionId, muteId: restriction.id, expiresAt }
      })
    },

    unmute(id) {
      const sessionId = chatId(id, 'session ID')
      return write(async (tx, actor) => {
        const now = new Date()
        const revoked = await tx.update(mutedUsers).set({ revokedAt: now }).where(activeMute(sessionId, now))
          .returning({ id: mutedUsers.id })
        if (revoked.length) {
          await recordAdminAction(tx, actor, 'unmute', 'chat_session', sessionId, { muteIds: revoked.map(row => row.id) })
        }
        return { sessionId, revoked: revoked.length }
      })
    },
  }
}

module.exports = { createChatModerator }
