import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePublicFeed } from './public-feed.js'

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

export function RadioPlayer() {
  const { state, data } = usePublicFeed('/api/v1/stream')
  const status = state === 'ready' ? data?.status ?? 'unknown' : state === 'loading' ? 'checking' : 'unknown'
  const streamUrl = data?.streamUrl
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
    <div className="radio-player">
      <p className="stream-status" data-status={status} role="status">{streamLabels[status]}</p>
      <div className="player-controls">
        <button type="button" className="playback-button" disabled={!streamUrl} onClick={canStop ? () => stop() : play}>
          <span className={canStop ? 'stop-symbol' : 'play-symbol'} aria-hidden="true" />
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
    </div>
  )
}
