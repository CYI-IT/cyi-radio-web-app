import { useCallback, useEffect, useRef, useState } from 'react'

function historyPath(cursor = {}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const query = new URLSearchParams(cursor)
  if (timezone) query.set('timezone', timezone)
  return `/messages?${query}`
}

export async function chatRequest(path, { body, signal = AbortSignal.timeout(10_000) } = {}) {
  const response = await fetch(`/api/v1/chat${path}`, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const result = await response.json()
  if (!response.ok) {
    throw Object.assign(new Error(result.message ?? 'Chat is temporarily unavailable.'), { code: result.code })
  }
  return result
}

function mergeMessages(messages, changes, retainedFrom) {
  const byId = new Map(messages.filter(message => message.createdAt >= retainedFrom).map(message => [message.id, message]))
  for (const change of changes) {
    if (change.removed) byId.delete(change.id)
    else byId.set(change.id, change)
  }
  return [...byId.values()].sort((a, b) => a.position.length - b.position.length || a.position.localeCompare(b.position))
}

export function useChatHistory(realtime) {
  const [feed, setFeed] = useState({ messages: [], before: null, state: 'loading' })
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const cursor = useRef(null)
  const pending = useRef(null)
  const resetTimer = useRef(null)
  const lastSync = useRef(0)
  const connected = useRef(false)

  const perform = useCallback(task => {
    const controller = new AbortController()
    const request = { controller, result: null }
    pending.current = request
    const timeout = setTimeout(() => controller.abort(), 10_000)
    request.result = task(controller.signal).catch(() => {
      if (pending.current === request) setFeed(previous => ({ ...previous, state: 'error' }))
    }).finally(() => {
      clearTimeout(timeout)
      if (pending.current === request) pending.current = null
    })
    return request.result
  }, [])

  const refresh = useCallback(function sync() {
    if (document.hidden || !navigator.onLine) return
    const active = pending.current
    if (active) {
      if (!active.refreshQueued) {
        active.refreshQueued = true
        active.result.then(() => {
          if (!active.controller.signal.aborted) sync()
        })
      }
      return
    }
    return perform(async signal => {
      function scheduleReset(delay) {
        clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => {
          pending.current?.controller.abort()
          pending.current = null
          cursor.current = null
          setFeed({ messages: [], before: null, state: 'ready' })
          sync()
        }, delay)
      }

      if (cursor.current === null) {
        const page = await chatRequest(historyPath(), { signal })
        if (!signal.aborted) {
          cursor.current = page.cursor
          scheduleReset(page.resetAfterMs)
          setFeed({ messages: page.messages, before: page.before, retainedFrom: page.retainedFrom, state: 'ready' })
        }
      } else {
        // Limit catch-up work per refresh. The next refresh continues at this cursor.
        for (let pageCount = 0; pageCount < 4; pageCount++) {
          const page = await chatRequest(historyPath({ after: cursor.current }), { signal })
          if (signal.aborted) return
          cursor.current = page.cursor
          scheduleReset(page.resetAfterMs)
          setFeed(previous => ({
            ...previous,
            messages: mergeMessages(previous.messages, page.changes, page.retainedFrom),
            before: previous.retainedFrom === page.retainedFrom ? previous.before : null,
            retainedFrom: page.retainedFrom,
            state: 'ready',
          }))
          if (!page.hasMore) break
        }
      }
      lastSync.current = Date.now()
    })
  }, [perform])

  async function loadEarlier() {
    setLoadingEarlier(true)
    try {
      const active = pending.current
      if (active) {
        await active.result
        if (active.controller.signal.aborted) return
      }
      if (!feed.before || pending.current) return
      await perform(async signal => {
        const page = await chatRequest(historyPath({ before: feed.before }), { signal })
        if (!signal.aborted) {
          setFeed(previous => ({
            messages: mergeMessages(previous.messages, page.messages, page.retainedFrom),
            before: page.before,
            retainedFrom: page.retainedFrom,
            state: 'ready',
          }))
        }
      })
    } finally {
      setLoadingEarlier(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(() => {
      if (!connected.current || Date.now() - lastSync.current >= 8_000) refresh()
    }, 4_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      pending.current?.controller.abort()
      pending.current = null
      clearInterval(timer)
      clearTimeout(resetTimer.current)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!realtime) return
    let closed = false
    let socket
    function connectWhenVisible() {
      if (document.hidden || !navigator.onLine) socket?.disconnect()
      else socket?.connect()
    }

    import('socket.io-client').then(({ io }) => {
      if (closed) return
      socket = io({
        path: '/api/v1/chat/socket.io', transports: ['websocket'], autoConnect: false,
        reconnectionDelayMax: 10_000, timeout: 5_000,
      })
      socket.on('connect', () => {
        connected.current = true
        refresh()
      })
      socket.on('disconnect', () => {
        connected.current = false
        refresh()
      })
      socket.on('chat:changed', refresh)
      connectWhenVisible()
    }).catch(() => {})
    document.addEventListener('visibilitychange', connectWhenVisible)
    window.addEventListener('online', connectWhenVisible)
    window.addEventListener('offline', connectWhenVisible)
    return () => {
      closed = true
      socket?.removeAllListeners()
      socket?.disconnect()
      connected.current = false
      document.removeEventListener('visibilitychange', connectWhenVisible)
      window.removeEventListener('online', connectWhenVisible)
      window.removeEventListener('offline', connectWhenVisible)
    }
  }, [realtime, refresh])

  return { ...feed, refresh, loadEarlier, loadingEarlier }
}
