import React, { cloneElement, useEffect, useId, useRef, useState } from 'react'

export async function requestAdmin(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api/v1/admin${path}`, {
    method, signal,
    ...(method === 'GET' ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload.message ?? 'The request failed. Try again.')
    error.status = response.status
    throw error
  }
  return payload
}

export function useResource(api, path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    if (path) api(path, { signal: controller.signal }).then(setData, error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [api, path, revision])

  return {
    data, error,
    refresh() {
      setError('')
      setRevision(previous => previous + 1)
    },
  }
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function run(task, confirmation) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await task()
      setMessage(confirmation ?? '')
      return result
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, error, message }
}

export function Notice({ error, message }) {
  if (error) return <p className="notice error" role="alert">{error}</p>
  return message ? <p className="notice" role="status">{message}</p> : null
}

export function Loading({ resource }) {
  if (resource.error) return <><Notice error={resource.error} /><button onClick={resource.refresh}>Try again</button></>
  return <p role="status" className="muted">Loading…</p>
}

export function Field({ label, children, wide = false }) {
  const id = useId()
  return <div className={wide ? 'field wide' : 'field'}>
    <label htmlFor={id}>{label}</label>{cloneElement(children, { id })}
  </div>
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>
}

export function Editor({ title, onClose, children }) {
  const dialog = useRef(null)
  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    modal.showModal()
    return () => {
      if (modal.open) modal.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  return (
    <dialog ref={dialog} className="editor" onClose={onClose} aria-label={title}>
      <div className="editor-head">
        <h2>{title}</h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close editor">Close</button>
      </div>
      {children}
    </dialog>
  )
}

export const dateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
})

export const optionalValue = (fields, name) => fields.get(name)?.trim() || null
