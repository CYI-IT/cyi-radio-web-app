const assert = require('node:assert/strict')
const { test } = require('node:test')
const { findConflict, scheduleAt, scheduleToday, segmentsForSeries } = require('../server/occurrences.cjs')

const timezone = 'Africa/Accra'
const weekly = {
  id: 'weekly',
  programmeId: 'programme',
  presenterId: 'original',
  kind: 'weekly',
  startsOn: '2026-11-25', // Wednesday
  startTime: '23:30:00',
  durationMinutes: 90,
  weekdays: 31,
  endsOn: null,
}

function oneTime(id, startsOn, startTime, durationMinutes = 60) {
  return { ...weekly, id, kind: 'one-time', startsOn, startTime, durationMinutes, weekdays: null }
}

function overlap(a, b) {
  return findConflict(segmentsForSeries(a), segmentsForSeries(b))
}

test('uses the previous local date for a programme still on after midnight', () => {
  const live = scheduleAt([weekly], timezone, new Date('2026-11-26T00:15:00Z'))
  assert.equal(live.current.occurrenceDate, '2026-11-25')
  assert.equal(live.current.endsAt, '2026-11-26T01:00:00')
  const gap = scheduleAt([weekly], timezone, new Date('2026-11-26T01:00:00Z'))
  assert.equal(gap.current, null)
  assert.equal(gap.upcoming[0].startsAt, '2026-11-26T23:30:00')
})

test('lists the full station-local day, including shows that cross midnight', () => {
  const series = [
    oneTime('ends-at-midnight', '2026-11-25', '23:00:00'),
    oneTime('overnight', '2026-11-25', '23:30:00', 90),
    ...Array.from({ length: 12 }, (_, hour) => oneTime(`show-${hour}`, '2026-11-26',
      `${String(hour + 1).padStart(2, '0')}:00:00`)),
    oneTime('tomorrow', '2026-11-27', '00:00:00'),
  ]
  const afterMidnight = scheduleToday(series, 'Africa/Lagos', new Date('2026-11-25T23:15:00Z'))
  assert.equal(afterMidnight.current.seriesId, 'overnight')
  assert.deepEqual(afterMidnight.programmes.map(entry => entry.seriesId),
    ['overnight', ...Array.from({ length: 12 }, (_, hour) => `show-${hour}`)])
  const later = scheduleToday(series, 'Africa/Lagos', new Date('2026-11-26T17:00:00Z'))
  assert.equal(later.current, null)
  assert.deepEqual(later.programmes, afterMidnight.programmes)
})

test('uses effective dates, presenters, and durations for isolated occurrence changes', () => {
  const series = {
    ...weekly,
    endsOn: '2026-11-27',
    exceptions: [
      { occurrenceDate: '2026-11-25', action: 'cancel' },
      { occurrenceDate: '2026-11-26', action: 'override', startsOn: '2026-11-28',
        startTime: '12:00:00', durationMinutes: 30, presenterId: 'replacement' },
    ],
  }
  const result = scheduleAt([series], timezone, new Date('2026-11-25T00:00:00Z'))
  assert.deepEqual(result.upcoming.map(entry => [entry.occurrenceDate, entry.startsAt, entry.presenterId]), [
    ['2026-11-27', '2026-11-27T23:30:00', 'original'],
    ['2026-11-26', '2026-11-28T12:00:00', 'replacement'],
  ])
  const duringOverride = scheduleAt([series], timezone, new Date('2026-11-28T12:15:00Z'))
  assert.equal(duringOverride.current.endsAt, '2026-11-28T12:30:00')
})

test('detects distant overlaps, respects cancelled occurrences, and permits adjacent slots', () => {
  const friday = { ...weekly, weekdays: 16 }
  const distant = oneTime('distant', '2099-01-03', '00:15:00')
  assert.ok(overlap(friday, distant))
  assert.equal(overlap(friday, oneTime('adjacent', '2099-01-03', '01:00:00')), null)
  const cancelled = { ...friday, exceptions: [{ occurrenceDate: '2099-01-02', action: 'cancel' }] }
  assert.equal(overlap(cancelled, distant), null)
  const openEnded = { ...weekly, id: 'distant-weekly', startsOn: '2099-01-03', weekdays: 32, startTime: '00:15:00' }
  assert.ok(overlap(friday, openEnded))
  assert.equal(overlap({ ...friday, endsOn: '2099-01-01' }, openEnded), null)
})

test('detects a duration that overlaps the next occurrence of the same weekday', () => {
  const series = { ...weekly, weekdays: 16, durationMinutes: 7 * 24 * 60 + 1 }
  assert.deepEqual(findConflict(segmentsForSeries(series)).map(entry => entry.occurrenceDate),
    ['2026-11-27', '2026-12-04'])
})

test('chooses the most recent start when an override allows two active programmes', () => {
  const earlier = oneTime('earlier', '2026-11-26', '01:00:00', 120)
  const later = oneTime('later', '2026-11-26', '02:00:00')
  const { current } = scheduleAt([earlier, later], timezone, new Date('2026-11-26T02:30:00Z'))
  assert.equal(current.seriesId, 'later')
})

test('breaks ties between a moved and regular occurrence by original date', () => {
  const series = {
    ...weekly,
    exceptions: [{ occurrenceDate: '2026-11-25', action: 'override', startsOn: '2026-11-26' }],
  }
  const { current } = scheduleAt([series], timezone, new Date('2026-11-27T00:15:00Z'))
  assert.equal(current.occurrenceDate, '2026-11-25')
})
