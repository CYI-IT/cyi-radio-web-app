const limits = { name: 30, message: 500, page: 30 }

class ChatError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function chatText(value, label, min, max) {
  if (typeof value !== 'string' || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)) {
    throw new ChatError(400, 'invalid-text', `Enter a valid ${label}.`)
  }
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ')
  const length = [...normalized].length
  if (length < min || length > max) {
    throw new ChatError(400, 'invalid-text', `Use ${min} to ${max} characters for your ${label}.`)
  }
  return normalized
}

function chatId(value, label = 'message ID') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ChatError(400, 'invalid-id', `Use a valid ${label}.`)
  }
  return value.toLowerCase()
}

function readCursor(value, minimum) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,18})$/.test(value)) {
    throw new ChatError(400, 'invalid-cursor', 'Use a valid chat history cursor.')
  }
  const cursor = BigInt(value)
  if (cursor < minimum || cursor > 9_223_372_036_854_775_807n) {
    throw new ChatError(400, 'invalid-cursor', 'Use a valid chat history cursor.')
  }
  return cursor
}

module.exports = { ChatError, chatId, chatText, limits, readCursor }
