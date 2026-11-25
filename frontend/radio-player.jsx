import React, { useCallback, useEffect, useRef, useState } from 'react'

const streamLabels = {
  checking: 'Checking stream status',
  online: 'Stream online',
  offline: 'Stream offline',
  unknown: 'Stream status unavailable',
}
const playbackLabels = {
  connecting: 'Connecting to the stream…',
  playing: 'Playing live audio',
  buffering: 'Buffering live audio…',
  error: 'Couldn’t play the stream. Try again in a moment.',
}

function useStreamStatus() {
  const [stream, setStream] = useState({ status: 'checking', streamUrl: null })

  useEffect(() => {
    const controller = new AbortController()
    let pending = false

    async function refresh() {
      if (pending || document.hidden) return
      pending = true
      try {
        const response = await fetch('/api/v1/stream', { signal: controller.signal })
        if (!response.ok) throw new Error('Stream check failed')
        const result = await response.json()
        if (!controller.signal.aborted) setStream(result)
      } catch {
        if (!controller.signal.aborted) {
          setStream(previous => ({ ...previous, status: 'unknown' }))
        }
      } finally {
        pending = false
      }
    }

    refresh()
    const interval = setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return stream
}

export function RadioPlayer() {
  const { status, streamUrl } = useStreamStatus()
  const audioRef = useRef(null)
  const activeAttempt = useRef(null)
  const [playback, setPlayback] = useState('idle')
  const [muted, setMuted] = useState(false)
  const canStop = playback === 'playing' || playback === 'buffering' || playback === 'connecting'

  const stop = useCallback((nextState = 'idle') => {
    activeAttempt.current = null
    const audio = audioRef.current
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    setPlayback(nextState)
  }, [])

  useEffect(() => {
    if (playback !== 'connecting' && playback !== 'buffering') return
    const timeout = setTimeout(() => stop('error'), 15_000)
    return () => clearTimeout(timeout)
  }, [playback, stop])

  function play() {
    const audio = audioRef.current
    const attempt = Symbol()
    activeAttempt.current = attempt
    setPlayback('connecting')
    audio.src = streamUrl
    audio.play().catch(() => {
      if (activeAttempt.current === attempt) stop('error')
    })
  }

  function updatePlayback(state) {
    if (activeAttempt.current) setPlayback(state)
  }

  function playbackFailed() {
    if (activeAttempt.current) stop('error')
  }

  function playbackPaused(event) {
    const audio = event.currentTarget
    if (activeAttempt.current && audio.paused && !audio.ended) stop()
  }

  return (
    <section className="radio-player" aria-labelledby="radio-player-heading">
      <div className="radio-player-title">
        <h2 id="radio-player-heading">Listen live</h2>
        <p className="stream-status" data-status={status} role="status">{streamLabels[status]}</p>
      </div>
      <div className="player-controls">
        <button type="button" className="playback-button" disabled={!streamUrl} onClick={canStop ? () => stop() : play}>
          {canStop ? 'Stop' : playback === 'error' ? 'Try again' : 'Play'}
        </button>
        <button type="button" className="mute-button" aria-pressed={muted} onClick={() => setMuted(value => !value)}>
          Mute
        </button>
      </div>
      <p className="playback-status" role="status">{playbackLabels[playback]}</p>
      <audio
        ref={audioRef}
        preload="none"
        muted={muted}
        onPlaying={() => updatePlayback('playing')}
        onWaiting={() => updatePlayback('buffering')}
        onPause={playbackPaused}
        onError={playbackFailed}
        onEnded={playbackFailed}
      />
    </section>
  )
}
