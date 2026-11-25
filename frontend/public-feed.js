import { useCallback, useEffect, useRef, useState } from 'react'

export function usePublicFeed(path) {
  const [feed, setFeed] = useState({ state: 'loading', data: null })
  const pending = useRef(null)

  const refresh = useCallback(async () => {
    if (document.hidden || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setFeed(previous => previous.state === 'error' ? { ...previous, state: 'retrying' } : previous)
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
    refresh()
    const interval = setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      pending.current?.abort()
      pending.current = null
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  return { ...feed, refresh }
}
