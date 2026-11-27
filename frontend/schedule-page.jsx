import React, { useMemo, useState } from 'react'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'
import { CaretLeftIcon } from '@phosphor-icons/react/CaretLeft'
import { CaretRightIcon } from '@phosphor-icons/react/CaretRight'
import { ListBulletsIcon } from '@phosphor-icons/react/ListBullets'
import { ProgrammeList, ScheduleFeedback } from './listener-schedule.jsx'
import { usePublicFeed } from './public-feed.js'
import { addDays, dateAtMidnight, mondayIndex, monthStart, programmesOnDate, timezoneLabel } from './schedule-dates.js'

const longDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' })
const weekRange = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
})
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const dayOfMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function DayProgrammes({ entries, date }) {
  return entries.length ? <ProgrammeList programmes={entries} date={date} /> : (
    <p className="schedule-message">No programmes scheduled.</p>
  )
}

function WeeklyLineup({ days, today }) {
  return (
    <div className="schedule-panel weekly-lineup">
      {days.map(({ date, entries }) => {
        const timestamp = dateAtMidnight(date)
        return (
          <section className="lineup-day" key={date} data-today={date === today} aria-labelledby={`lineup-${date}`}>
            <div className="lineup-date">
              <h3 id={`lineup-${date}`}>
                <time dateTime={date}>
                  <span>{dayName.format(timestamp)}</span>
                  <span>{dayOfMonth.format(timestamp)}</span>
                </time>
              </h3>
              {date === today ? <span className="lineup-today">Today</span> : null}
            </div>
            <DayProgrammes entries={entries} date={date} />
          </section>
        )
      })}
    </div>
  )
}

function MonthlyCalendar({ days, today, selected, onSelect }) {
  const activeDay = days.find(day => day.date === selected)
  return (
    <div className="schedule-panel schedule-calendar">
      <div className="calendar-grid" role="group" aria-label="Select a broadcast date">
        {weekdays.map(day => (
          <span key={day} className="calendar-weekday" aria-hidden="true">{day.slice(0, 3)}</span>
        ))}
        {Array.from({ length: mondayIndex(days[0].date) }, (_, index) => (
          <span key={index} className="calendar-spacer" aria-hidden="true" />
        ))}
        {days.map(({ date, entries }) => {
          const count = entries.length
          return (
            <button key={date} type="button" className="calendar-day"
              aria-label={`${longDate.format(dateAtMidnight(date))}, ${count} ${count === 1 ? 'programme' : 'programmes'}`}
              aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined}
              onClick={() => onSelect(date)}>
              <span>{Number(date.slice(-2))}</span>
              {count ? <span className="calendar-count">{count}<span> {count === 1 ? 'show' : 'shows'}</span></span> : null}
            </button>
          )
        })}
      </div>
      <section className="calendar-lineup" aria-labelledby="calendar-lineup-heading">
        <h3 id="calendar-lineup-heading" aria-live="polite">{longDate.format(dateAtMidnight(selected))}</h3>
        <DayProgrammes entries={activeDay.entries} date={selected} />
      </section>
    </div>
  )
}

function SchedulePeriod({ from, to, calendar, today, selected, onSelect, offline }) {
  const feed = usePublicFeed(`/api/v1/schedule?from=${from}&to=${to}`)
  const programmes = feed.data?.programmes
  const days = useMemo(() => {
    if (!Array.isArray(programmes)) return []
    const result = []
    for (let date = from; date < to; date = addDays(date, 1)) {
      result.push({ date, entries: programmesOnDate(programmes, date) })
    }
    return result
  }, [from, to, programmes])

  if (offline || feed.state !== 'ready' || !days.length) {
    return <ScheduleFeedback {...feed} offline={offline} />
  }
  return calendar ? <MonthlyCalendar days={days} today={today} selected={selected} onSelect={onSelect} />
    : <WeeklyLineup days={days} today={today} />
}

export function SchedulePage({ today, timezone, offline }) {
  const [calendar, setCalendar] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const selected = selectedDate ?? today
  const from = calendar ? monthStart(selected) : addDays(selected, -mondayIndex(selected))
  const to = calendar ? monthStart(from, 1) : addDays(from, 7)
  const period = calendar ? 'month' : 'week'

  function movePeriod(direction) {
    setSelectedDate(calendar ? monthStart(from, direction) : addDays(from, direction * 7))
  }

  return (
    <section className="schedule-page" aria-labelledby="schedule-page-heading">
      <header className="schedule-page-header">
        <h1 id="schedule-page-heading">Programme schedule</h1>
        <p className="schedule-timezone"><CalendarBlankIcon size={18} aria-hidden="true" /> All times in {timezoneLabel(timezone)}</p>
      </header>
      <div className="schedule-toolbar">
        <div className="schedule-period">
          <div className="schedule-period-buttons" role="group" aria-label={`Browse by ${period}`}>
            <button className="icon-button" type="button" aria-label={`Previous ${period}`} onClick={() => movePeriod(-1)}>
              <CaretLeftIcon size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" aria-label={`Next ${period}`} onClick={() => movePeriod(1)}>
              <CaretRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <button className="button button-quiet" type="button" onClick={() => setSelectedDate(null)}>Today</button>
        </div>
        <div className="schedule-view-switch" role="group" aria-label="Schedule view">
          <button type="button" className="button" aria-pressed={!calendar} onClick={() => setCalendar(false)}>
            <ListBulletsIcon size={18} aria-hidden="true" /> Week
          </button>
          <button type="button" className="button" aria-pressed={calendar} onClick={() => setCalendar(true)}>
            <CalendarBlankIcon size={18} aria-hidden="true" /> Calendar
          </button>
        </div>
      </div>
      <h2 className="schedule-period-heading" aria-live="polite">
        {calendar ? monthName.format(dateAtMidnight(from)) : weekRange.formatRange(dateAtMidnight(from), dateAtMidnight(addDays(to, -1)))}
      </h2>
      <SchedulePeriod key={`${from}/${to}`} from={from} to={to} calendar={calendar}
        today={today} selected={selected} onSelect={setSelectedDate} offline={offline} />
    </section>
  )
}
