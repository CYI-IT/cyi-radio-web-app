import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'
import { ChatCircleDotsIcon } from '@phosphor-icons/react/ChatCircleDots'
import { ClipboardTextIcon } from '@phosphor-icons/react/ClipboardText'
import { FadersIcon } from '@phosphor-icons/react/Faders'
import { HouseIcon } from '@phosphor-icons/react/House'
import { ListIcon } from '@phosphor-icons/react/List'
import { MicrophoneStageIcon } from '@phosphor-icons/react/MicrophoneStage'
import { MusicNotesIcon } from '@phosphor-icons/react/MusicNotes'
import { UsersIcon } from '@phosphor-icons/react/Users'
import { XIcon } from '@phosphor-icons/react/X'
import { Catalog, Schedule } from './schedule.jsx'
import { Accounts, Audit, Moderation, Settings } from './management.jsx'
import { Field, Notice, requestAdmin, useAction, useResource } from './components.jsx'
import './styles.css'

const logo = '/assets/CYI-radio-original-2.png'
const sections = [
  { id: 'overview', label: 'Overview', Icon: HouseIcon },
  { id: 'schedule', label: 'Schedule', permission: ['schedule.manage'], Icon: CalendarBlankIcon },
  { id: 'programmes', label: 'Programmes', permission: ['programmes.manage', 'schedule.manage'], Icon: MusicNotesIcon },
  { id: 'presenters', label: 'Presenters', permission: ['programmes.manage', 'schedule.manage'], Icon: MicrophoneStageIcon },
  { id: 'chat', label: 'Chat moderation', permission: ['chat.moderate'], Icon: ChatCircleDotsIcon },
  { id: 'accounts', label: 'Administrators', permission: ['admins.manage'], Icon: UsersIcon },
  { id: 'audit', label: 'Audit log', permission: ['audit.read'], Icon: ClipboardTextIcon },
  { id: 'settings', label: 'Station settings', permission: ['settings.manage'], Icon: FadersIcon },
]

function SignIn({ resetToken, onSignIn, onPasswordSet, message, error }) {
  const action = useAction()
  const resetting = Boolean(resetToken)

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const password = values.get('password')
    if (resetting) {
      const result = await action.run(async () => {
        if (password !== values.get('confirm')) throw new Error('The passwords must match.')
        return requestAdmin('/password', { method: 'POST', body: { token: resetToken, password } })
      })
      if (result) onPasswordSet()
    } else {
      const session = await action.run(async () => {
        await requestAdmin('/login', { method: 'POST', body: { email: values.get('email'), password } })
        return requestAdmin('/session')
      })
      if (session) onSignIn(session)
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src={logo} alt="CYI Radio" width="160" height="74" />
        <h1>{resetting ? 'Set your password' : 'Administrator sign-in'}</h1>
        <form className="stack" onSubmit={submit}>
          {!resetting && <Field label="Email"><input name="email" type="email" autoComplete="username" maxLength={254} required /></Field>}
          <Field label={resetting ? 'New password' : 'Password'}>
            <input name="password" type="password" autoComplete={resetting ? 'new-password' : 'current-password'}
              maxLength={256} minLength={resetting ? 15 : undefined} required />
          </Field>
          {resetting && <Field label="Confirm password"><input name="confirm" type="password" autoComplete="new-password"
            minLength={15} maxLength={256} required /></Field>}
          {resetting && <p className="muted">Use at least 15 characters.</p>}
          <Notice error={action.error || error} message={message} />
          <button className="primary" disabled={action.busy}>
            {action.busy ? 'Please wait…' : resetting ? 'Save password' : 'Sign in'}
          </button>
        </form>
        {!resetting && <p className="auth-help">Need a password link? Contact a Super Admin.</p>}
        <a href="/">Back to live radio</a>
      </div>
    </main>
  )
}

function Overview({ admin, api }) {
  const feed = useResource(requestSchedule, '/api/v1/schedule')
  const action = useAction()
  const current = feed.data?.current
  const upcoming = feed.data?.upcoming?.[0]

  return (
    <div className="overview">
      <div className="overview-shows">
        <section><h2>On the schedule now</h2><strong>{current?.programme.title ?? (feed.error ? 'Schedule unavailable' : feed.data ? 'No programme scheduled' : 'Loading…')}</strong>
          {current?.presenter && <p>{current.presenter.name}</p>}
        </section>
        <section><h2>Next programme</h2><strong>{upcoming?.programme.title ?? (feed.error ? 'Schedule unavailable' : feed.data ? 'No upcoming programme' : 'Loading…')}</strong>
          {upcoming && <p>{upcoming.startsAt.replace('T', ' ').slice(0, 16)} · Accra</p>}
        </section>
      </div>
      {admin.permissions.length === 0 && <div className="empty stack">
        <p>Ask a Super Admin to assign a role to your account.</p>
        <div><button disabled={action.busy} onClick={() => action.run(() => api('/session'))}>Refresh access</button></div>
        <Notice error={action.error} />
      </div>}
    </div>
  )
}

async function requestSchedule(path, { signal }) {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new Error('Schedule unavailable.')
  return response.json()
}

function AdminLinks({ sections, current, onNavigate }) {
  return <nav aria-label="Administration">
    {sections.map(({ id, label, Icon }) => <a key={id} href={`#${id}`}
      aria-current={current === id ? 'page' : undefined} onClick={onNavigate ? event => onNavigate(event, id) : undefined}>
      <Icon size={19} aria-hidden="true" />{label}
    </a>)}
  </nav>
}

function AccountControls({ name, action, onSignOut }) {
  return <div className="account-controls">
    <span>{name}</span>
    <button disabled={action.busy} onClick={() => action.run(onSignOut)}>Sign out</button>
  </div>
}

function CompactNavigation({ sections, current, name, action, onSignOut, onNavigate }) {
  const drawer = useRef(null)
  const toggle = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const button = toggle.current
    const dialog = drawer.current
    const observer = new ResizeObserver(() => {
      if (dialog.open && !button.getClientRects().length) dialog.close()
    })
    observer.observe(button)
    return () => observer.disconnect()
  }, [])

  function followLink(event, id) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    drawer.current.close()
    onNavigate(id)
  }

  return <>
    <header className="admin-topbar">
      <div className="admin-brand"><img src={logo} alt="CYI Radio" width="88" height="41" /><span>Administration</span></div>
      <button className="admin-menu-toggle" ref={toggle} aria-haspopup="dialog" aria-controls="admin-drawer"
        aria-expanded={open} onClick={() => {
          drawer.current.showModal()
          setOpen(true)
        }}><ListIcon size={22} aria-hidden="true" /> Menu</button>
    </header>
    <dialog id="admin-drawer" className="admin-drawer" ref={drawer} aria-labelledby="admin-drawer-heading"
      onClose={() => setOpen(false)} onClick={event => {
        if (event.target === event.currentTarget) drawer.current.close()
      }}>
      <div className="admin-drawer-shell">
        <div className="admin-drawer-head">
          <h2 id="admin-drawer-heading">Administration</h2>
          <button className="admin-menu-toggle" aria-label="Close menu" onClick={() => drawer.current.close()}>
            <XIcon size={22} aria-hidden="true" />
          </button>
        </div>
        <AdminLinks sections={sections} current={current} onNavigate={followLink} />
        <div className="admin-drawer-footer">
          <AccountControls name={name} action={action} onSignOut={onSignOut} />
          <Notice error={action.error} />
          <a className="listener-link" href="/">Back to live radio</a>
        </div>
      </div>
    </dialog>
  </>
}

function Workspace({ admin, api, onSignOut }) {
  const [active, setActive] = useState(() => window.location.hash.slice(1))
  const content = useRef(null)
  const action = useAction()
  const visible = sections.filter(section => !section.permission || section.permission.some(key => admin.permissions.includes(key)))
  const section = visible.find(item => item.id === active) ?? visible[0]

  useEffect(() => {
    const changeSection = () => setActive(window.location.hash.slice(1))
    window.addEventListener('hashchange', changeSection)
    return () => window.removeEventListener('hashchange', changeSection)
  }, [])

  const panels = {
    overview: () => <Overview admin={admin} api={api} />,
    schedule: () => <Schedule api={api} canOverride={admin.permissions.includes('schedule.override')} />,
    programmes: () => <Catalog api={api} kind="programmes" canEdit={admin.permissions.includes('programmes.manage')} />,
    presenters: () => <Catalog api={api} kind="presenters" canEdit={admin.permissions.includes('programmes.manage')} />,
    chat: () => <Moderation api={api} />,
    accounts: () => <Accounts api={api} />,
    audit: () => <Audit api={api} />,
    settings: () => <Settings api={api} />,
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content" onClick={event => {
        event.preventDefault()
        content.current.focus()
      }}>Skip to content</a>
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src={logo} alt="CYI Radio" width="118" height="54" /><span>Administration</span></div>
        <AdminLinks sections={visible} current={section.id} />
        <a className="listener-link" href="/">Back to live radio</a>
      </aside>
      <CompactNavigation sections={visible} current={section.id} name={admin.displayName} action={action}
        onSignOut={onSignOut} onNavigate={id => {
          setActive(id)
          window.scrollTo(0, 0)
          content.current.focus({ preventScroll: true })
        }} />
      <main ref={content} id="admin-content" tabIndex={-1} className="admin-content">
        <header className="page-head">
          <h1>{section.label}</h1>
          <AccountControls name={admin.displayName} action={action} onSignOut={onSignOut} />
        </header>
        <Notice error={action.error} />
        <div key={section.id}>{panels[section.id]()}</div>
      </main>
    </div>
  )
}

const readResetToken = () => new URLSearchParams(window.location.hash.slice(1)).get('reset') || ''

function App() {
  const [resetToken, setResetToken] = useState(readResetToken)
  const [admin, setAdmin] = useState(null)
  const [checking, setChecking] = useState(!resetToken)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    function captureResetLink() {
      const token = readResetToken()
      if (!token) return
      window.history.replaceState(null, '', '/admin')
      setResetToken(token)
      setChecking(false)
      setError('')
      setMessage('')
    }
    captureResetLink()
    window.addEventListener('hashchange', captureResetLink)
    return () => window.removeEventListener('hashchange', captureResetLink)
  }, [])

  useEffect(() => {
    if (!checking) return
    const controller = new AbortController()
    requestAdmin('/session', { signal: controller.signal }).then(setAdmin, error => {
      if (!controller.signal.aborted && error.status !== 401) setError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setChecking(false)
    })
    return () => controller.abort()
  }, [checking])

  const api = useCallback(async (path, options) => {
    try {
      const result = await requestAdmin(path, options)
      if (path === '/session') setAdmin(result)
      return result
    } catch (error) {
      if (error.status === 401) {
        setAdmin(null)
        setError('Your session has ended. Sign in again.')
      }
      throw error
    }
  }, [])

  if (checking) return <main className="auth-shell"><p role="status">Checking your session…</p></main>
  if (!admin || resetToken) return <SignIn key={resetToken ? 'reset' : 'login'} resetToken={resetToken}
    message={message} error={error} onSignIn={setAdmin} onPasswordSet={() => {
      setAdmin(null)
      setResetToken('')
      setError('')
      setMessage('Password saved. Sign in to continue.')
    }} />
  return <Workspace admin={admin} api={api} onSignOut={async () => {
    await api('/logout', { method: 'POST' })
    setAdmin(null)
    setError('')
    setMessage('')
  }} />
}

createRoot(document.getElementById('root')).render(<App />)
