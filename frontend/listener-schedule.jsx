import React, { useState } from 'react'
import { BroadcastIcon } from '@phosphor-icons/react/Broadcast'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'

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

function UpcomingProgrammes({ upcoming }) {
  const [selected, setSelected] = useState('')
  const dates = new Map()
  for (const entry of upcoming) {
    const day = localDate(entry.startsAt)
    if (!dates.has(day)) dates.set(day, [])
    dates.get(day).push(entry)
  }
  const selectedDate = dates.has(selected) ? selected : ''
  const shownDates = selectedDate ? [[selectedDate, dates.get(selectedDate)]] : dates

  return (
    <section className="upcoming" aria-labelledby="upcoming-heading">
      <div className="upcoming-header">
        <h3 id="upcoming-heading">Coming up</h3>
        {dates.size > 1 ? (
          <label className="date-filter">
            <span className="visually-hidden">Filter upcoming programmes by date</span>
            <select value={selectedDate} onChange={event => setSelected(event.target.value)}>
              <option value="">All dates</option>
              {Array.from(dates.keys(), day => (
                <option key={day} value={day}>{scheduleDate.format(new Date(`${day}T00:00:00Z`))}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {dates.size ? (
        Array.from(shownDates, ([day, entries]) => (
          <section className="schedule-day" key={day} aria-labelledby={`schedule-${day}`}>
            <h4 id={`schedule-${day}`}><time dateTime={day}>{scheduleDate.format(new Date(`${day}T00:00:00Z`))}</time></h4>
            <ol className="schedule-list">
              {entries.map(entry => (
                <li className="schedule-entry" key={`${entry.seriesId}/${entry.occurrenceDate}`}>
                  <div className="entry-programme">
                    <p className="entry-title">{entry.programme.title}</p>
                    {entry.presenter ? <p className="programme-presenter">with {entry.presenter.name}</p> : null}
                  </div>
                  <TimeRange startsAt={entry.startsAt} endsAt={entry.endsAt} />
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

export function ListenerSchedule({ feed }) {
  const { state, data, refresh } = feed
  const ready = state === 'ready' && Array.isArray(data?.upcoming)
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
          <UpcomingProgrammes upcoming={data.upcoming} />
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
