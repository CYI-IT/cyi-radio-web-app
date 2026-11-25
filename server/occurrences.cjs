const secondsPerDay = 86_400
const secondsPerWeek = 7 * secondsPerDay

function dayNumber(date) {
  return Date.parse(`${date}T00:00:00Z`) / 1000 / secondsPerDay
}

function weekday(day) {
  return ((day + 3) % 7 + 7) % 7
}

function timeSeconds(time) {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

function dateOf(second) {
  return new Date(second * 1000).toISOString().split('T')[0]
}

function localTimestamp(second) {
  return new Date(second * 1000).toISOString().slice(0, -5)
}

function includesDate(series, date) {
  if (series.kind === 'one-time') return date === series.startsOn
  return date >= series.startsOn && (!series.endsOn || date <= series.endsOn) &&
    Boolean(series.weekdays & (1 << weekday(dayNumber(date))))
}

function segment(series, first, last, durationMinutes, presenterId, occurrenceDate = null) {
  return {
    seriesId: series.id,
    programmeId: series.programmeId,
    presenterId,
    occurrenceDate,
    first,
    last,
    duration: durationMinutes * 60,
  }
}

function singleOccurrence(series, date, exception) {
  if (exception?.action === 'cancel') return null
  const start = dayNumber(exception?.startsOn ?? date) * secondsPerDay +
    timeSeconds(exception?.startTime ?? series.startTime)
  return segment(series, start, start, exception?.durationMinutes ?? series.durationMinutes,
    exception?.presenterId ?? series.presenterId, date)
}

function segmentsForSeries(series) {
  const exceptions = (series.exceptions ?? []).filter(exception => includesDate(series, exception.occurrenceDate))
  if (series.kind === 'one-time') {
    const slot = singleOccurrence(series, series.startsOn, exceptions[0])
    return slot ? [slot] : []
  }

  const startDay = dayNumber(series.startsOn)
  const endDay = series.endsOn ? dayNumber(series.endsOn) : Infinity
  const startTime = timeSeconds(series.startTime)
  const excludedDays = Array.from({ length: 7 }, () => [])
  const segments = []
  for (const exception of exceptions) {
    const day = dayNumber(exception.occurrenceDate)
    excludedDays[weekday(day)].push(day)
    const replacement = singleOccurrence(series, exception.occurrenceDate, exception)
    if (replacement) segments.push(replacement)
  }

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    if (!(series.weekdays & (1 << dayOfWeek))) continue
    let first = startDay + (dayOfWeek - weekday(startDay) + 7) % 7
    if (first > endDay) continue
    const last = endDay === Infinity ? Infinity : first + Math.floor((endDay - first) / 7) * 7
    for (const excluded of excludedDays[dayOfWeek].sort((a, b) => a - b)) {
      if (first < excluded) {
        segments.push(segment(series, first * secondsPerDay + startTime,
          (excluded - 7) * secondsPerDay + startTime, series.durationMinutes, series.presenterId))
      }
      first = excluded + 7
    }
    if (first <= last) {
      segments.push(segment(series, first * secondsPerDay + startTime,
        last * secondsPerDay + startTime, series.durationMinutes, series.presenterId))
    }
  }
  return segments
}

function occurrence(slot, start) {
  return {
    seriesId: slot.seriesId,
    programmeId: slot.programmeId,
    presenterId: slot.presenterId,
    occurrenceDate: slot.occurrenceDate ?? dateOf(start),
    startsAt: localTimestamp(start),
    endsAt: localTimestamp(start + slot.duration),
  }
}

function overlap(a, b) {
  // The difference between two starts changes in whole weeks. Clip its possible
  // range to the differences that overlap, then find the first compatible value.
  const firstDifference = b.first - a.first
  const minimum = Math.max(b.first - a.last, 1 - b.duration)
  const maximum = Math.min(b.last - a.first, a.duration - 1)
  const difference = firstDifference + Math.ceil((minimum - firstDifference) / secondsPerWeek) * secondsPerWeek
  if (difference > maximum) return null
  const aStart = Math.max(a.first, b.first - difference)
  return [occurrence(a, aStart), occurrence(b, aStart + difference)]
}

function findConflict(candidates, others = []) {
  for (const [index, slot] of candidates.entries()) {
    if (slot.last > slot.first && slot.duration > secondsPerWeek) {
      return [occurrence(slot, slot.first), occurrence(slot, slot.first + secondsPerWeek)]
    }
    for (const other of others) {
      const conflict = overlap(slot, other)
      if (conflict) return conflict
    }
    for (let preceding = 0; preceding < index; preceding++) {
      const conflict = overlap(slot, candidates[preceding])
      if (conflict) return conflict
    }
  }
  return null
}

function stationClock(now, timezone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const { year, month, day, hour, minute, second } = Object.fromEntries(
    formatter.formatToParts(now).map(({ type, value }) => [type, value]),
  )
  return dayNumber(`${year.padStart(4, '0')}-${month}-${day}`) * secondsPerDay +
    timeSeconds(`${hour}:${minute}:${second}`) + now.getUTCMilliseconds() / 1000
}

function compareEntries(a, b) {
  return a.start - b.start || a.slot.seriesId.localeCompare(b.slot.seriesId) ||
    (a.slot.occurrenceDate ?? dateOf(a.start)).localeCompare(b.slot.occurrenceDate ?? dateOf(b.start))
}

function scheduleAt(series, timezone, now = new Date(), limit = 10) {
  const clock = stationClock(now, timezone)
  let current = null
  const upcoming = []
  for (const slot of series.flatMap(segmentsForSeries)) {
    const last = Math.min(slot.last, slot.first + Math.floor((clock - slot.first) / secondsPerWeek) * secondsPerWeek)
    if (last >= slot.first && clock < last + slot.duration) {
      const entry = { slot, start: last }
      if (!current || last > current.start || (last === current.start && compareEntries(entry, current) < 0)) {
        current = entry
      }
    }
    const firstUpcoming = Math.max(slot.first, last + secondsPerWeek)
    for (let i = 0, start = firstUpcoming; i < limit && start <= slot.last; i++, start += secondsPerWeek) {
      upcoming.push({ slot, start })
    }
  }
  return {
    current: current ? occurrence(current.slot, current.start) : null,
    upcoming: upcoming.sort(compareEntries).slice(0, limit).map(({ slot, start }) => occurrence(slot, start)),
  }
}

module.exports = { includesDate, timeSeconds, singleOccurrence, segmentsForSeries, findConflict, scheduleAt }
