import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

function subscribeOnline(update) {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}

const onlineStatus = () => navigator.onLine

export function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, onlineStatus)
}

export function usePublicFeed(path) {
  const [feed, setFeed] = useState(() => ({ state: navigator.onLine ? 'loading' : 'offline', data: null }))
  const pending = useRef(null)

  const refresh = useCallback(async () => {
    if (!navigator.onLine || document.hidden || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setFeed(previous => ['error', 'offline'].includes(previous.state) ? { ...previous, state: 'retrying' } : previous)
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(path, { signal: controller.signal })
      if (!response.ok) throw new Error('Public feed unavailable')
      const data = await response.json()
      if (pending.current === controller) setFeed({ state: 'ready', data })
    } catch {
      if (pending.current === controller) setFeed(previous => ({ ...previous, state: 'error' }))
    } finally {
      clearTimeout(timeout)
      if (pending.current === controller) pending.current = null
    }
  }, [path])

  useEffect(() => {
    function syncConnection() {
      if (navigator.onLine) {
        refresh()
      } else {
        pending.current?.abort()
        pending.current = null
        setFeed({ state: 'offline', data: null })
      }
    }
    const unsubscribe = subscribeOnline(syncConnection)
    syncConnection()
    const interval = setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      pending.current?.abort()
      pending.current = null
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
      unsubscribe()
    }
  }, [refresh])

  return { ...feed, refresh }
}
