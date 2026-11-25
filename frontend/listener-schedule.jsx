import React from 'react'
import { usePublicFeed } from './public-feed.js'

// The API timestamps are already station-local. UTC keeps Intl from shifting their wall times.
const scheduleDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const shortDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
})
const scheduleTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
})
const preciseTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
})

function localDate(timestamp) {
  return timestamp.split('T')[0]
}

function formatTime(timestamp) {
  const formatter = timestamp.endsWith(':00') ? scheduleTime : preciseTime
  return formatter.format(new Date(`${timestamp}Z`))
}

function TimeRange({ startsAt, endsAt }) {
  const nextDate = localDate(startsAt) === localDate(endsAt) ? null : shortDate.format(new Date(`${endsAt}Z`))
  return (
    <span className="schedule-time">
      <time dateTime={startsAt}>{formatTime(startsAt)}</time>
      {' to '}
      <time dateTime={endsAt}>{formatTime(endsAt)}{nextDate ? <small> {nextDate}</small> : null}</time>
    </span>
  )
}

function ScheduledNow({ current }) {
  return (
    <section className="scheduled-now" aria-labelledby="scheduled-now-heading">
      <h3 id="scheduled-now-heading">Scheduled now</h3>
      {current ? (
        <div className="current-programme">
          <p className="current-title">{current.programme.title}</p>
          {current.presenter ? <p className="programme-presenter">with {current.presenter.name}</p> : null}
          <p className="current-time"><TimeRange startsAt={current.startsAt} endsAt={current.endsAt} /></p>
          {current.programme.description ? <p className="current-description">{current.programme.description}</p> : null}
        </div>
      ) : (
        <p className="schedule-message">No programme scheduled right now.</p>
      )}
    </section>
  )
}

function UpcomingProgrammes({ upcoming }) {
  const dates = new Map()
  for (const entry of upcoming) {
    const day = localDate(entry.startsAt)
    if (!dates.has(day)) dates.set(day, [])
    dates.get(day).push(entry)
  }

  return (
    <section className="upcoming" aria-labelledby="upcoming-heading">
      <h3 id="upcoming-heading">Coming up</h3>
      {dates.size ? (
        Array.from(dates, ([day, entries]) => (
          <section className="schedule-day" key={day} aria-labelledby={`schedule-${day}`}>
            <h4 id={`schedule-${day}`}><time dateTime={day}>{scheduleDate.format(new Date(`${day}T00:00:00Z`))}</time></h4>
            <ol className="schedule-list">
              {entries.map(entry => (
                <li className="schedule-entry" key={`${entry.seriesId}/${entry.occurrenceDate}`}>
                  <TimeRange startsAt={entry.startsAt} endsAt={entry.endsAt} />
                  <div className="entry-programme">
                    <p className="entry-title">{entry.programme.title}</p>
                    {entry.presenter ? <p className="programme-presenter">with {entry.presenter.name}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <p className="schedule-message">No upcoming programmes are scheduled.</p>
      )}
    </section>
  )
}

export function ListenerSchedule() {
  const { state, data, refresh } = usePublicFeed('/api/v1/schedule')
  const ready = state === 'ready' && Array.isArray(data?.upcoming)
  const timezone = data?.timezone === 'Africa/Accra' ? 'Accra (GMT)' : data?.timezone?.replaceAll('_', ' ')

  return (
    <section id="schedule" className="listener-schedule" aria-labelledby="schedule-heading">
      <header className="schedule-header">
        <h2 id="schedule-heading">Programme schedule</h2>
        {ready ? <p className="schedule-timezone">Times in {timezone}</p> : null}
      </header>
      {ready ? (
        <div className="schedule-grid">
          <ScheduledNow current={data.current} />
          <UpcomingProgrammes upcoming={data.upcoming} />
        </div>
      ) : state === 'loading' ? (
        <p className="schedule-message schedule-feedback" role="status">Loading the programme schedule…</p>
      ) : (
        <div className="schedule-feedback">
          <p className="schedule-message" role="status">The programme schedule is temporarily unavailable.</p>
          <button className="schedule-retry" type="button" disabled={state === 'retrying'} onClick={refresh}>
            {state === 'retrying' ? 'Retrying…' : 'Retry schedule'}
          </button>
        </div>
      )}
    </section>
  )
}
