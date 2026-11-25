import React from 'react'
import { BroadcastIcon } from '@phosphor-icons/react/Broadcast'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'

// The API timestamps are already station-local. UTC keeps Intl from shifting their wall times.
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

function stationDate(timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts()
  const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${year}-${month}-${day}`
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
      <span className="visually-hidden"> to </span>
      <span aria-hidden="true">–</span>
      <time dateTime={endsAt}>{formatTime(endsAt)}{nextDate ? <small> {nextDate}</small> : null}</time>
    </span>
  )
}

function ScheduledNow({ current }) {
  return (
    <section className="scheduled-now" aria-labelledby="scheduled-now-heading">
      <span className="programme-icon"><BroadcastIcon size={24} aria-hidden="true" /></span>
      <div className="current-programme">
        <h3 id="scheduled-now-heading">Scheduled now</h3>
        {current ? (
          <>
            <p className="current-title">{current.programme.title}</p>
            {current.presenter ? <p className="programme-presenter">with {current.presenter.name}</p> : null}
            {current.programme.description ? <p className="current-description">{current.programme.description}</p> : null}
          </>
        ) : (
          <p className="schedule-message">No programme scheduled right now.</p>
        )}
      </div>
      {current ? <TimeRange startsAt={current.startsAt} endsAt={current.endsAt} /> : null}
    </section>
  )
}

function TodaysProgrammes({ programmes, current, upcomingOnly }) {
  const remaining = programmes.filter(entry =>
    entry.seriesId !== current?.seriesId || entry.occurrenceDate !== current?.occurrenceDate,
  )
  const heading = upcomingOnly ? 'Coming up today' : current ? 'Also today' : 'Today’s programmes'
  const emptyMessage = upcomingOnly ? 'No upcoming programmes are scheduled for today.'
    : current ? 'No other programmes are scheduled today.' : 'No programmes are scheduled today.'

  return (
    <section className="today-programmes" aria-labelledby="today-programmes-heading">
      <h3 id="today-programmes-heading">{heading}</h3>
      {remaining.length ? (
        <ol className="schedule-list">
          {remaining.map(entry => (
            <li className="schedule-entry" key={`${entry.seriesId}/${entry.occurrenceDate}`}>
              <div className="entry-programme">
                <p className="entry-title">{entry.programme.title}</p>
                {entry.presenter ? <p className="programme-presenter">with {entry.presenter.name}</p> : null}
              </div>
              <TimeRange startsAt={entry.startsAt} endsAt={entry.endsAt} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="schedule-message">{emptyMessage}</p>
      )}
    </section>
  )
}

export function ListenerSchedule({ feed }) {
  const { state, data, refresh } = feed
  const fullDay = Array.isArray(data?.programmes)
  // During a cPanel rollout the new page can load before the API restarts.
  const upcomingOnly = !fullDay && Array.isArray(data?.upcoming) && Boolean(data.timezone)
  const ready = state === 'ready' && (fullDay || upcomingOnly)
  const today = ready && upcomingOnly ? stationDate(data.timezone) : null
  const programmes = upcomingOnly ? data.upcoming.filter(entry => localDate(entry.startsAt) === today)
    : data?.programmes
  const timezone = data?.timezone === 'Africa/Accra' ? 'Accra (GMT)' : data?.timezone?.replaceAll('_', ' ')

  return (
    <section id="schedule" className="listener-schedule" aria-labelledby="schedule-heading">
      <header className="section-header">
        <h2 id="schedule-heading">Programme schedule</h2>
        {ready && timezone ? (
          <p className="schedule-timezone"><CalendarBlankIcon size={17} aria-hidden="true" /> {timezone}</p>
        ) : null}
      </header>
      {ready ? (
        <div className="schedule-panel">
          <ScheduledNow current={data.current} />
          <TodaysProgrammes programmes={programmes} current={data.current} upcomingOnly={upcomingOnly} />
        </div>
      ) : state === 'loading' ? (
        <div className="schedule-panel schedule-feedback" role="status">
          <span className="skeleton-line" aria-hidden="true" />
          <p className="schedule-message">Loading the programme schedule…</p>
        </div>
      ) : (
        <div className="schedule-panel schedule-feedback">
          <p className="schedule-message" role="status">The programme schedule is temporarily unavailable.</p>
          <button className="button button-quiet" type="button" disabled={state === 'retrying'} onClick={refresh}>
            {state === 'retrying' ? 'Retrying…' : 'Retry schedule'}
          </button>
        </div>
      )}
    </section>
  )
}
