import React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react/ArrowRight'
import { BroadcastIcon } from '@phosphor-icons/react/Broadcast'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'
import { programmesOnDate, timezoneLabel } from './schedule-dates.js'

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

function formatTime(timestamp) {
  const formatter = timestamp.endsWith(':00') ? scheduleTime : preciseTime
  return formatter.format(new Date(`${timestamp}Z`))
}

function TimeRange({ startsAt, endsAt, date = localDate(startsAt) }) {
  const startDate = localDate(startsAt) === date ? null : shortDate.format(new Date(`${startsAt}Z`))
  const endDate = localDate(endsAt) === date ? null : shortDate.format(new Date(`${endsAt}Z`))
  return (
    <span className="schedule-time">
      <time dateTime={startsAt}>{formatTime(startsAt)}{startDate ? <small> {startDate}</small> : null}</time>
      <span className="visually-hidden"> to </span>
      <span aria-hidden="true">–</span>
      <time dateTime={endsAt}>{formatTime(endsAt)}{endDate ? <small> {endDate}</small> : null}</time>
    </span>
  )
}

function ScheduledNow({ current, today }) {
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
      {current ? <TimeRange startsAt={current.startsAt} endsAt={current.endsAt} date={today} /> : null}
    </section>
  )
}

export function ProgrammeList({ programmes, date }) {
  return (
    <ol className="schedule-list" role="list">
      {programmes.map(entry => (
        <li className="schedule-entry" key={`${entry.seriesId}/${entry.occurrenceDate}`}>
          <div className="entry-programme">
            <p className="entry-title">{entry.programme.title}</p>
            {entry.presenter ? <p className="programme-presenter">with {entry.presenter.name}</p> : null}
          </div>
          <TimeRange startsAt={entry.startsAt} endsAt={entry.endsAt} date={date} />
        </li>
      ))}
    </ol>
  )
}

function TodaysProgrammes({ programmes, current, upcomingOnly, today }) {
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
        <ProgrammeList programmes={remaining} date={today} />
      ) : (
        <p className="schedule-message">{emptyMessage}</p>
      )}
    </section>
  )
}

export function ScheduleFeedback({ state, refresh, offline }) {
  if (!offline && state === 'loading') {
    return (
      <div className="schedule-panel schedule-feedback" role="status">
        <span className="skeleton-line" aria-hidden="true" />
        <p className="schedule-message">Loading the programme schedule…</p>
      </div>
    )
  }

  return (
    <div className="schedule-panel schedule-feedback">
      <p className="schedule-message" role="status">{offline
        ? 'The programme schedule needs an internet connection.' : 'The programme schedule is temporarily unavailable.'}</p>
      {offline ? null : <button className="button button-quiet" type="button" disabled={state === 'retrying'} onClick={refresh}>
        {state === 'retrying' ? 'Retrying…' : 'Retry schedule'}
      </button>}
    </div>
  )
}

export function ListenerSchedule({ feed, current, today, offline, onNavigate }) {
  const { state, data } = feed
  const fullDay = Array.isArray(data?.programmes)
  // During a cPanel rollout the new page can load before the API restarts.
  const upcomingOnly = !fullDay && Array.isArray(data?.upcoming) && Boolean(data.timezone)
  const ready = !offline && state === 'ready' && (fullDay || upcomingOnly)
  const programmes = ready ? programmesOnDate(fullDay ? data.programmes : data.upcoming, today) : []

  return (
    <section id="schedule" className="listener-schedule" aria-labelledby="schedule-heading">
      <header className="section-header">
        <h2 id="schedule-heading">Programme schedule</h2>
        {ready && data.timezone ? (
          <p className="schedule-timezone"><CalendarBlankIcon size={17} aria-hidden="true" /> {timezoneLabel(data.timezone)}</p>
        ) : null}
      </header>
      {ready ? (
        <div className="schedule-panel">
          <ScheduledNow current={current} today={today} />
          <TodaysProgrammes programmes={programmes} current={current} upcomingOnly={upcomingOnly} today={today} />
        </div>
      ) : (
        <ScheduleFeedback {...feed} offline={offline} />
      )}
      <a className="full-schedule-link" href="/schedule" onClick={onNavigate}>
        View full schedule <ArrowRightIcon size={17} aria-hidden="true" />
      </a>
    </section>
  )
}
