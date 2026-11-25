import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chatRequest, useChatHistory } from './chat-feed.js'

const chatTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

function ChatMessages({ messages }) {
  const list = useRef(null)
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    if (atBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [messages])

  return (
    <div className="chat-messages" ref={list} role="log" aria-label="Listener messages"
      tabIndex={messages.length ? 0 : undefined} onScroll={event => {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
      atBottom.current = scrollHeight - scrollTop - clientHeight < 48
    }}>
      {messages.length ? (
        <ol aria-label="Chat messages">
          {messages.map(message => (
            <li key={message.id} className="chat-message">
              <div className="chat-message-meta">
                <strong>{message.displayName}</strong>
                <time dateTime={message.createdAt}>{chatTime.format(new Date(message.createdAt))}</time>
              </div>
              <p>{message.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function ChatRoom() {
  const [session, setSession] = useState(null)
  const [realtime, setRealtime] = useState(false)
  const [starting, setStarting] = useState(true)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef(null)
  const feed = useChatHistory(realtime)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let active = true
    chatRequest('/session', { signal: controller.signal }).then(data => {
      if (active) {
        setSession(data.session)
        setRealtime(data.realtime)
      }
    }).catch(() => {}).finally(() => {
      clearTimeout(timeout)
      if (active) setStarting(false)
    })
    return () => { active = false; controller.abort() }
  }, [])

  async function join(event) {
    event.preventDefault()
    if (busy || starting) return
    setBusy(true)
    setError('')
    try {
      const data = await chatRequest('/session', { body: { displayName: name } })
      setSession(data.session)
      setRealtime(data.realtime)
    } catch (failure) {
      setError(failure.code ? failure.message : 'Couldn’t join the chat. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function send(event) {
    event.preventDefault()
    if (busy || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      if (attempt.current?.body !== draft) attempt.current = { id: crypto.randomUUID(), body: draft }
      await chatRequest('/messages', { body: attempt.current })
      attempt.current = null
      setDraft('')
      feed.refresh()
    } catch (failure) {
      if (failure.code === 'join-required') setSession(null)
      if (failure.code === 'message-conflict') attempt.current = null
      setError(failure.code ? failure.message : 'Couldn’t send the message. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat-room">
      {feed.before ? <button type="button" className="schedule-retry" disabled={feed.loadingEarlier} onClick={feed.loadEarlier}>
        {feed.loadingEarlier ? 'Loading earlier messages…' : 'Load earlier messages'}
      </button> : null}
      {feed.state === 'loading' ? <p className="schedule-message" role="status">Loading chat…</p> : null}
      {feed.state === 'error' ? (
        <p className="schedule-message" role="status">
          Chat connection interrupted. <button type="button" className="schedule-retry" onClick={feed.refresh}>Retry chat</button>
        </p>
      ) : null}
      {feed.state === 'ready' && !feed.messages.length ? <p className="schedule-message">No messages yet</p> : null}
      <ChatMessages messages={feed.messages} />
      {session ? (
        <form className="chat-form" onSubmit={send}>
          <label htmlFor="chat-message">Message as {session.displayName}</label>
          <div className="chat-field">
            <input id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} readOnly={busy} required />
            <button type="submit" className="chat-primary" disabled={busy || !draft.trim()}>Send</button>
          </div>
        </form>
      ) : (
        <form className="chat-form" onSubmit={join}>
          <label htmlFor="chat-name">Display name</label>
          <div className="chat-field">
            <input id="chat-name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={30} required />
            <button type="submit" className="chat-primary" disabled={busy || starting}>Join chat</button>
          </div>
        </form>
      )}
      {error ? <p className="chat-error" role="status">{error}</p> : null}
    </div>
  )
}

export function ListenerChat() {
  const [open, setOpen] = useState(false)
  return (
    <section id="chat" className="listener-chat" aria-labelledby="chat-heading">
      <header className="chat-header">
        <h2 id="chat-heading">Listener chat</h2>
        <button type="button" className="schedule-retry" aria-controls="chat-panel" aria-expanded={open}
          onClick={() => setOpen(previous => !previous)}>{open ? 'Close chat' : 'Open chat'}</button>
      </header>
      <div id="chat-panel" hidden={!open}>{open ? <ChatRoom /> : null}</div>
    </section>
  )
}
