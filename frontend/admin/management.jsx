import React, { useState } from 'react'
import { dateTime, Editor, Empty, Field, Loading, Notice, optionalValue, useAction, useResource } from './components.jsx'

function PasswordLink({ link, onClose }) {
  const action = useAction()
  return <Editor title="One-time password link" onClose={onClose}>
    <div className="stack">
      <p>Share this link privately. It expires at {dateTime.format(new Date(link.expiresAt))} Accra time.</p>
      <Field label="Password link"><input readOnly value={link.url} onFocus={event => event.currentTarget.select()} /></Field>
      <Notice error={action.error} message={action.message} />
      <div className="form-actions">
        <button className="primary" onClick={() => action.run(async () => {
          try {
            await navigator.clipboard.writeText(link.url)
          } catch {
            throw new Error('Select and copy the link from the field above.')
          }
        }, 'Link copied.')}>Copy link</button>
        <button onClick={onClose}>Done</button>
      </div>
    </div>
  </Editor>
}

function AccountEditor({ api, row, roles, onClose, onSaved }) {
  const action = useAction()
  const path = row ? `/accounts/${row.id}` : '/accounts'

  async function save(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const body = { roles: values.getAll('roles'), ...(row
      ? { active: values.get('status') === 'active' }
      : { email: values.get('email'), displayName: values.get('displayName') }) }
    const account = await action.run(() => api(path, { method: row ? 'PATCH' : 'POST', body }))
    if (account) onSaved(account.passwordLink)
  }

  async function resetPassword() {
    const link = await action.run(() => api(`${path}/password-link`, { method: 'POST' }))
    if (link) onSaved(link)
  }

  return <Editor title={row ? row.displayName : 'New administrator'} onClose={onClose}>
    <form className="stack" onSubmit={save}>
      {row ? <>
        <p className="muted">{row.email}</p>
        <Field label="Account status"><select name="status" defaultValue={row.deactivatedAt ? 'deactivated' : 'active'}>
          <option value="active">Active</option><option value="deactivated">Deactivated</option>
        </select></Field>
      </> : <>
        <Field label="Display name"><input name="displayName" maxLength={200} required /></Field>
        <Field label="Email"><input name="email" type="email" maxLength={254} required /></Field>
      </>}
      <fieldset>
        <legend>Roles</legend>
        <div className="choices">{roles.map(role => <label className="check" key={role.key}>
          <input name="roles" type="checkbox" value={role.key} defaultChecked={row?.roles.includes(role.key)} />{role.name}
        </label>)}</div>
      </fieldset>
      <Notice error={action.error} />
      <div className="form-actions">
        <button className="primary" disabled={action.busy}>{row ? 'Save changes' : 'Create administrator'}</button>
        {row && !row.deactivatedAt && <button type="button" disabled={action.busy} onClick={resetPassword}>
          Create password link
        </button>}
      </div>
    </form>
  </Editor>
}

export function Accounts({ api }) {
  const resource = useResource(api, '/accounts')
  const [editor, setEditor] = useState(null)
  const [link, setLink] = useState(null)

  if (!resource.data) return <Loading resource={resource} />
  const { accounts, roles } = resource.data
  const roleNames = new Map(roles.map(role => [role.key, role.name]))

  return <>
    <div className="toolbar"><span>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>
      <button className="primary" onClick={() => setEditor({})}>New administrator</button></div>
    <Notice error={resource.error} />
    <ul className="records">{accounts.map(account => <li key={account.id}>
      <div><h2>{account.displayName}</h2><p>{account.email}</p>
        <p>{account.roles.map(key => roleNames.get(key)).join(', ') || 'No roles assigned'}</p>
        {account.deactivatedAt && <p className="state">Deactivated</p>}
      </div>
      <button onClick={() => setEditor({ row: account })}>Manage<span className="sr-only"> {account.displayName}</span></button>
    </li>)}</ul>
    {editor && <AccountEditor api={api} row={editor.row} roles={roles} onClose={() => setEditor(null)} onSaved={passwordLink => {
      setEditor(null)
      setLink(passwordLink ?? null)
      resource.refresh()
    }} />}
    {link && <PasswordLink link={link} onClose={() => setLink(null)} />}
  </>
}

function ModerationEditor({ api, editor, onClose, onSaved }) {
  const action = useAction()
  const { mode, row } = editor
  const title = { delete: 'Delete message', mute: 'Mute chat session', unmute: 'Unmute chat session' }[mode]

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const duration = values.get('duration')
    const reason = optionalValue(values, 'reason')
    const result = await action.run(() => api(mode === 'delete' ? `/messages/${row.id}` : `/mutes/${row.sessionId}`, {
      method: mode === 'mute' ? 'PUT' : 'DELETE', body: mode === 'mute' ? { duration, ...(reason ? { reason } : {}) } : {},
    }))
    if (result) onSaved()
  }

  return <Editor title={title} onClose={onClose}>
    <form className="stack" onSubmit={submit}>
      <p><strong>{row.displayName}</strong></p>
      {mode === 'delete' && <blockquote>{row.body}</blockquote>}
      {mode === 'mute' && <>
        <Field label="Mute duration"><select name="duration" defaultValue="15">
          <option value="15">15 minutes</option><option value="60">1 hour</option>
          <option value="1440">24 hours</option><option value="permanent">Permanent</option>
        </select></Field>
        <Field label="Reason (optional)"><textarea name="reason" rows={3} maxLength={500} /></Field>
      </>}
      <Notice error={action.error} />
      <div className="form-actions"><button className={mode === 'unmute' ? 'primary' : 'danger'} disabled={action.busy}>{title}</button></div>
    </form>
  </Editor>
}

export function Moderation({ api }) {
  const messages = useResource(api, '/messages')
  const mutes = useResource(api, '/mutes')
  const [editor, setEditor] = useState(null)
  const mutedSessions = new Set(mutes.data?.map(row => row.sessionId))

  function refresh() {
    messages.refresh()
    mutes.refresh()
  }

  return <>
    <div className="toolbar"><button onClick={refresh}>Refresh chat</button></div>
    <section className="stack moderation-section">
      <h2>Recent messages</h2>
      {messages.data ? <>
        <Notice error={messages.error} />
        {messages.data.length ? <ul className="records">{messages.data.map(row => <li key={row.id}>
          <div><h3>{row.displayName}</h3><p><time dateTime={row.createdAt}>{dateTime.format(new Date(row.createdAt))}</time></p>
            <div className="message-body">{row.body}</div></div>
          <div className="row-actions">
            <button onClick={() => setEditor({ mode: 'delete', row })}>Delete</button>
            {mutedSessions.has(row.sessionId) ? <span className="state">Muted</span> :
              <button onClick={() => setEditor({ mode: 'mute', row })}>Mute</button>}
          </div>
        </li>)}</ul> : <Empty>No recent messages.</Empty>}
      </> : <Loading resource={messages} />}
    </section>
    <section className="stack moderation-section">
      <h2>Active mutes</h2>
      {mutes.data ? <>
        <Notice error={mutes.error} />
        {mutes.data.length ? <ul className="records">{mutes.data.map(row => <li key={row.id}>
          <div><h3>{row.displayName}</h3><p>{row.expiresAt ? `Until ${dateTime.format(new Date(row.expiresAt))} Accra time` : 'Permanent'}</p>
            {row.reason && <p>{row.reason}</p>}</div>
          <button onClick={() => setEditor({ mode: 'unmute', row })}>Unmute</button>
        </li>)}</ul> : <Empty>No active mutes.</Empty>}
      </> : <Loading resource={mutes} />}
    </section>
    {editor && <ModerationEditor api={api} editor={editor} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); refresh() }} />}
  </>
}

const resources = {
  admin: 'Administrator', programme: 'Programme', presenter: 'Presenter', schedule_series: 'Schedule',
  schedule_exception: 'Schedule exception', chat_message: 'Chat message', chat_session: 'Chat session', station_setting: 'Station setting',
}

function AuditPage({ api, before, goBack, goForward }) {
  const resource = useResource(api, `/audit${before ? `?before=${encodeURIComponent(before)}` : ''}`)
  if (!resource.data) return <Loading resource={resource} />

  const { entries, before: next } = resource.data
  return <>
    {entries.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Time (Accra)</th><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Resource</th></tr></thead>
      <tbody>{entries.map(row => <tr key={row.id}>
        <td><time dateTime={row.createdAt}>{dateTime.format(new Date(row.createdAt))}</time></td>
        <td>{row.administrator}<small>{row.email}</small></td>
        <td className="audit-action">{row.action.replaceAll('-', ' ')}</td>
        <td><details><summary>{resources[row.resource] ?? row.resource}</summary>
          <small>{row.resourceId}</small><pre>{JSON.stringify(row.metadata, null, 2)}</pre></details></td>
      </tr>)}</tbody>
    </table></div> : <Empty>No activity recorded.</Empty>}
    <div className="toolbar"><div className="row-actions">
      <button disabled={!before} onClick={goBack}>Newer</button>
      <button disabled={!next} onClick={() => goForward(next)}>Older</button>
    </div></div>
  </>
}

export function Audit({ api }) {
  const [pages, setPages] = useState([null])
  const before = pages.at(-1)
  return <AuditPage key={before ?? 'current'} api={api} before={before}
    goBack={() => setPages(previous => previous.slice(0, -1))}
    goForward={id => setPages(previous => [...previous, id])} />
}

export function Settings({ api }) {
  const resource = useResource(api, '/settings')
  const action = useAction()
  if (!resource.data) return <Loading resource={resource} />

  return <form className="settings-form stack" onSubmit={event => {
    event.preventDefault()
    const description = new FormData(event.currentTarget).get('description')
    action.run(() => api('/settings', { method: 'PATCH', body: { description } }), 'Station settings saved.')
  }}>
    <Field label="Listener introduction"><textarea name="description" rows={4}
      maxLength={250} defaultValue={resource.data.description} required /></Field>
    <p className="muted">Appears above the play button on the listener page.</p>
    <Notice error={action.error} message={action.message} />
    <div className="form-actions"><button className="primary" disabled={action.busy}>Save settings</button></div>
  </form>
}
