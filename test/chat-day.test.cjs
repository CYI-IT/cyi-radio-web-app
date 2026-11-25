const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createChatDay } = require('../server/chat-day.cjs')

test('chat switches days at exactly midnight in Accra', () => {
  const chatDay = createChatDay('Africa/Accra')
  const midnight = Date.parse('2026-11-26T00:00:00Z')

  assert.equal(chatDay(midnight - 1).end, midnight)
  assert.deepEqual(chatDay(midnight), {
    start: midnight,
    end: Date.parse('2026-11-27T00:00:00Z'),
  })
})

test('a configured station timezone follows its local midnight across clock changes', () => {
  const chatDay = createChatDay('America/New_York')

  assert.deepEqual(chatDay(Date.parse('2026-03-08T18:00:00Z')), {
    start: Date.parse('2026-03-08T05:00:00Z'),
    end: Date.parse('2026-03-09T04:00:00Z'),
  })
})
