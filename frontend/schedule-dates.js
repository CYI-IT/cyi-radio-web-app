import { useEffect, useMemo, useState } from 'react'

export const stationTimezone = 'Africa/Accra'

export function dateAtMidnight(date) {
  return new Date(`${date}T00:00:00Z`)
}

function dateKey(date) {
  return date.toISOString().split('T')[0]
}

export function addDays(date, days) {
  const next = dateAtMidnight(date)
  next.setUTCDate(next.getUTCDate() + days)
  return dateKey(next)
}

export function mondayIndex(date) {
  return (dateAtMidnight(date).getUTCDay() + 6) % 7
}

export function monthStart(date, months = 0) {
  const start = dateAtMidnight(`${date.slice(0, 7)}-01`)
  start.setUTCMonth(start.getUTCMonth() + months)
  return dateKey(start)
}

export function programmesOnDate(programmes, date) {
  const start = `${date}T00:00:00`
  const end = `${addDays(date, 1)}T00:00:00`
  return programmes.filter(entry => entry.startsAt < end && entry.endsAt > start)
}

export function timezoneLabel(timezone) {
  return timezone === stationTimezone ? 'Accra (GMT)' : timezone.replaceAll('_', ' ')
}

export function useStationToday(timezone) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const update = () => setNow(Date.now())
    // Station date changes occur on a minute boundary. Recheck after resuming the tab too.
    let interval
    const timeout = setTimeout(() => {
      update()
      interval = setInterval(update, 60_000)
    }, 60_000 - Date.now() % 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${year}-${month}-${day}`
  }, [now, timezone])
}
