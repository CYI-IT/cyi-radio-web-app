import React, { useState } from 'react'
import { Editor, Empty, Field, Loading, Notice, optionalValue, useAction, useResource } from './components.jsx'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function Records({ records, render }) {
  return <ul className="records">{records.map(row => <li key={row.id}>{render(row)}</li>)}</ul>
}

function Archive({ label, onArchive, disabled }) {
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <div className="form-actions">
      <button type="button" onClick={() => setConfirming(false)}>Keep {label}</button>
      <button type="button" className="danger" onClick={onArchive} disabled={disabled}>Confirm archive</button>
    </div>
  ) : <button type="button" className="danger" onClick={() => setConfirming(true)}>Archive {label}</button>
}

function CatalogEditor({ api, kind, row, onClose, onSaved }) {
  const action = useAction()
  const programme = kind === 'programmes'
  const label = programme ? 'programme' : 'presenter'
  const name = programme ? 'title' : 'name'
  const description = programme ? 'description' : 'bio'
  const path = row ? `/${kind}/${row.id}` : `/${kind}`

  async function save(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const body = {
      [name]: fields.get(name), slug: fields.get('slug'), [description]: optionalValue(fields, description),
      imagePath: optionalValue(fields, 'imagePath'),
    }
    const saved = await action.run(() => api(path, { method: row ? 'PATCH' : 'POST', body }))
    if (saved) onSaved()
  }

  async function archive() {
    if (await action.run(() => api(path, { method: 'DELETE' }))) onSaved()
  }

  return <Editor title={row ? `Edit ${label}` : `New ${label}`} onClose={onClose}>
    <form className="form-grid" onSubmit={save}>
      <Field label={programme ? 'Title' : 'Name'}><input name={name} defaultValue={row?.[name]} maxLength={200} required /></Field>
      <Field label="Slug"><input name="slug" defaultValue={row?.slug} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*"
        title="Use lowercase letters, numbers and hyphens" required /></Field>
      <Field label={programme ? 'Description' : 'Biography'} wide>
        <textarea name={description} defaultValue={row?.[description] ?? ''} maxLength={5000} rows={4} />
      </Field>
      <Field label="Local image path" wide><input name="imagePath" placeholder="/assets/example.webp"
        defaultValue={row?.imagePath ?? ''} maxLength={500} /></Field>
      <div className="wide"><Notice error={action.error} /></div>
      <div className="form-actions wide">
        <button className="primary" disabled={action.busy}>Save {label}</button>
        {row && <Archive label={label} onArchive={archive} disabled={action.busy} />}
      </div>
    </form>
  </Editor>
}

export function Catalog({ api, kind, canEdit }) {
  const resource = useResource(api, `/${kind}`)
  const [editor, setEditor] = useState(null)
  const [archived, setArchived] = useState(false)
  const programmes = kind === 'programmes'
  const rows = resource.data?.filter(row => Boolean(row.archivedAt) === archived) ?? []

  return <>
    <div className="toolbar">
      <label className="check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />
        Show archived</label>
      {canEdit && <button className="primary" onClick={() => setEditor({})}>New {programmes ? 'programme' : 'presenter'}</button>}
    </div>
    {resource.data ? <>
      <Notice error={resource.error} />
      {rows.length ? <Records records={rows} render={row => <>
        <div><h2>{programmes ? row.title : row.name}</h2><p>{row.slug}</p>
          {(programmes ? row.description : row.bio) && <p>{programmes ? row.description : row.bio}</p>}</div>
        {canEdit && !row.archivedAt && <button onClick={() => setEditor({ row })}>Edit</button>}
      </>} /> : <Empty>{archived ? 'No archived records.' : `No ${kind} yet.`}</Empty>}
    </> : <Loading resource={resource} />}
    {editor && <CatalogEditor api={api} kind={kind} row={editor.row} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); resource.refresh() }} />}
  </>
}

function PersonSelect({ id, name, rows, selected, placeholder, required }) {
  return <select id={id} name={name} defaultValue={selected ?? ''} required={required}>
    <option value="">{placeholder}</option>
    {rows.filter(row => !row.archivedAt).map(row => <option key={row.id} value={row.id}>{row.title ?? row.name}</option>)}
  </select>
}

function DurationFields({ duration, required }) {
  const [endTime, setEndTime] = useState('')
  return <>
    <Field label="Duration (minutes)"><input name="durationMinutes" type="number" min="1" max="2147483647"
      defaultValue={duration ?? ''} required={required && !endTime} disabled={Boolean(endTime)} /></Field>
    <Field label="End time (optional)"><input name="endTime" type="time" step="1" value={endTime}
      onChange={event => setEndTime(event.target.value)} /></Field>
  </>
}

function durationValues(values) {
  const endTime = optionalValue(values, 'endTime')
  if (endTime) return { endTime }
  const minutes = optionalValue(values, 'durationMinutes')
  return minutes === null ? {} : { durationMinutes: Number(minutes) }
}

function SeriesEditor({ api, row, programmes, presenters, canOverride, onClose, onSaved }) {
  const action = useAction()
  const [kind, setKind] = useState(row?.kind ?? 'one-time')
  const path = row ? `/series/${row.id}` : '/series'

  async function save(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const body = {
      programmeId: values.get('programmeId'), presenterId: values.get('presenterId'), kind,
      startsOn: values.get('startsOn'), startTime: values.get('startTime'),
      publicationStatus: values.get('publicationStatus'), ...durationValues(values),
      ...(kind === 'weekly' ? { weekdays: values.getAll('weekdays').map(Number), endsOn: optionalValue(values, 'endsOn') } : {}),
      ...(canOverride ? { overrideReason: optionalValue(values, 'overrideReason') } : {}),
    }
    if (await action.run(() => api(path, { method: row ? 'PATCH' : 'POST', body }))) onSaved()
  }

  return <Editor title={row ? 'Edit schedule' : 'New schedule'} onClose={onClose}>
    <form className="form-grid" onSubmit={save}>
      <Field label="Programme"><PersonSelect name="programmeId" rows={programmes} selected={row?.programmeId}
        placeholder="Choose a programme" required /></Field>
      <Field label="Presenter"><PersonSelect name="presenterId" rows={presenters} selected={row?.presenterId}
        placeholder="Choose a presenter" required /></Field>
      <Field label="Repeats"><select value={kind} onChange={event => setKind(event.target.value)}>
        <option value="one-time">Once</option><option value="weekly">Weekly</option>
      </select></Field>
      <Field label="Publication"><select name="publicationStatus" defaultValue={row?.publicationStatus ?? 'draft'}>
        <option value="draft">Draft</option><option value="published">Published</option>
      </select></Field>
      <Field label="Start date"><input name="startsOn" type="date" defaultValue={row?.startsOn} required /></Field>
      <Field label="Start time (Accra)"><input name="startTime" type="time" step="1" defaultValue={row?.startTime} required /></Field>
      <DurationFields duration={row?.durationMinutes} required />
      {kind === 'weekly' && <>
        <fieldset className="wide">
          <legend>Days of the week</legend>
          <div className="choices">{weekdays.map((day, index) => <label className="check" key={day}>
            <input type="checkbox" name="weekdays" value={index + 1} defaultChecked={Boolean(row?.weekdays & (1 << index))} />{day}
          </label>)}</div>
        </fieldset>
        <Field label="Repeat until (optional)"><input name="endsOn" type="date" defaultValue={row?.endsOn ?? ''} /></Field>
      </>}
      {canOverride && <Field label="Reason to allow an overlap (optional)" wide><input name="overrideReason" maxLength={500} /></Field>}
      <div className="wide"><Notice error={action.error} /></div>
      <div className="form-actions wide">
        <button className="primary" disabled={action.busy}>Save schedule</button>
        {row && <Archive label="schedule" disabled={action.busy}
          onArchive={async () => { if (await action.run(() => api(path, { method: 'DELETE' }))) onSaved() }} />}
      </div>
    </form>
  </Editor>
}

function ExceptionsEditor({ api, row, presenters, canOverride, onClose, onSaved }) {
  const [day, setDay] = useState('')
  const existing = row.exceptions.find(item => item.occurrenceDate === day)
  return <Editor title="Occurrence exceptions" onClose={onClose}>
    <div className="stack">
      {row.exceptions.length ? <ul className="exception-list">
        {row.exceptions.map(item => <li key={item.occurrenceDate}><span>{item.occurrenceDate}</span>
          <button type="button" onClick={() => setDay(item.occurrenceDate)}>
            {item.action === 'cancel' ? 'Cancelled' : 'Rescheduled or edited'}
          </button></li>)}
      </ul> : <p className="muted">No exceptions for this schedule.</p>}
      <Field label="Original occurrence date"><input type="date" value={day} onChange={event => setDay(event.target.value)} /></Field>
      {day && <ExceptionForm key={day} api={api} path={`/series/${row.id}/exceptions/${day}`} existing={existing}
        presenters={presenters} canOverride={canOverride} onSaved={onSaved} />}
    </div>
  </Editor>
}

function ExceptionForm({ api, path, existing, presenters, canOverride, onSaved }) {
  const action = useAction()
  const [mode, setMode] = useState(existing?.action ?? 'cancel')

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const approval = canOverride ? { overrideReason: optionalValue(values, 'overrideReason') } : {}
    const body = mode === 'override' ? {
      startsOn: optionalValue(values, 'startsOn'), startTime: optionalValue(values, 'startTime'),
      presenterId: optionalValue(values, 'presenterId'), ...durationValues(values), ...approval, action: mode,
    } : { action: mode, ...approval }
    if (await action.run(() => api(path, { method: mode === 'remove' ? 'DELETE' : 'PUT',
      body: mode === 'remove' ? approval : body }))) onSaved()
  }

  return <form onSubmit={submit} className="form-grid">
    <Field label="Change" wide><select value={mode} onChange={event => setMode(event.target.value)}>
      <option value="cancel">Cancel occurrence</option><option value="override">Edit occurrence</option>
      {existing && <option value="remove">Restore regular occurrence</option>}
    </select></Field>
    {mode === 'override' && <>
      <p className="muted wide">Leave a field blank to use the series value.</p>
      <Field label="New date"><input name="startsOn" type="date" defaultValue={existing?.startsOn ?? ''} /></Field>
      <Field label="New start time (Accra)"><input name="startTime" type="time" step="1" defaultValue={existing?.startTime ?? ''} /></Field>
      <DurationFields duration={existing?.durationMinutes} />
      <Field label="Presenter" wide><PersonSelect name="presenterId" rows={presenters} selected={existing?.presenterId}
        placeholder="Keep the scheduled presenter" /></Field>
    </>}
    {canOverride && mode !== 'cancel' && <Field label="Reason to allow an overlap (optional)" wide>
      <input name="overrideReason" maxLength={500} />
    </Field>}
    <div className="wide"><Notice error={action.error} /></div>
    <button className="primary" disabled={action.busy}>Save exception</button>
  </form>
}

export function Schedule({ api, canOverride }) {
  const series = useResource(api, '/series')
  const programmes = useResource(api, '/programmes')
  const presenters = useResource(api, '/presenters')
  const [archived, setArchived] = useState(false)
  const [editor, setEditor] = useState(null)

  if (!series.data || !programmes.data || !presenters.data) {
    const pending = [series, programmes, presenters].find(resource => resource.error) ??
      [series, programmes, presenters].find(resource => !resource.data)
    return <Loading resource={pending} />
  }

  const rows = series.data.filter(row => Boolean(row.archivedAt) === archived)
  const titles = new Map(programmes.data.map(row => [row.id, row.title]))
  const names = new Map(presenters.data.map(row => [row.id, row.name]))
  const canCreate = programmes.data.some(row => !row.archivedAt) && presenters.data.some(row => !row.archivedAt)
  const close = () => setEditor(null)
  const saved = () => { close(); series.refresh() }

  return <>
    <div className="toolbar">
      <label className="check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />
        Show archived</label>
      <button className="primary" disabled={!canCreate} onClick={() => setEditor({})}>New schedule</button>
    </div>
    {!canCreate && <p className="notice">Add an active programme and presenter before creating a schedule.</p>}
    <Notice error={series.error || programmes.error || presenters.error} />
    {rows.length ? <Records records={rows} render={row => <>
      <div>
        <h2>{titles.get(row.programmeId)}</h2>
        <p>{names.get(row.presenterId)} · {row.startsOn} at {row.startTime.slice(0, row.startTime.endsWith(':00') ? 5 : 8)}
          {' '}· {row.durationMinutes} min</p>
        {row.kind === 'weekly' && <p>{weekdays.filter((_, index) => row.weekdays & (1 << index)).join(', ')}
          {row.endsOn ? ` through ${row.endsOn}` : ''}</p>}
        <p className="state">{row.publicationStatus === 'published' ? 'Published' : 'Draft'}</p>
      </div>
      {!row.archivedAt && <div className="row-actions">
        <button onClick={() => setEditor({ row, exceptions: true })}>Exceptions</button><button onClick={() => setEditor({ row })}>Edit</button>
      </div>}
    </>} /> : <Empty>{archived ? 'No archived schedules.' : 'No schedules yet.'}</Empty>}
    {editor?.exceptions ? <ExceptionsEditor api={api} row={editor.row} presenters={presenters.data}
      canOverride={canOverride} onClose={close} onSaved={saved} /> : editor &&
      <SeriesEditor api={api} row={editor.row} programmes={programmes.data} presenters={presenters.data}
        canOverride={canOverride} onClose={close} onSaved={saved} />}
  </>
}
