import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PlayIcon } from '@phosphor-icons/react/Play'
import { SpeakerHighIcon } from '@phosphor-icons/react/SpeakerHigh'
import { SpeakerSlashIcon } from '@phosphor-icons/react/SpeakerSlash'
import { StopIcon } from '@phosphor-icons/react/Stop'
import { usePublicFeed } from './public-feed.js'

const streamLabels = {
  checking: 'Checking stream',
  online: 'Live on air',
  offline: 'Stream offline',
  unknown: 'Stream status unavailable',
}
const playbackLabels = {
  connecting: 'Connecting to the stream…',
  playing: 'Listening live',
  buffering: 'Buffering live audio…',
  error: 'Couldn’t play the stream. Try again.',
}

export function useRadioPlayer() {
  const { state, data, refresh } = usePublicFeed('/api/v1/stream')
  const status = state === 'ready' ? data?.status ?? 'unknown' : state === 'loading' ? 'checking' : 'unknown'
  const streamUrl = data?.streamUrl
  const audioRef = useRef(null)
  const activeAttempt = useRef(null)
  const [playback, setPlayback] = useState('idle')
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
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

  function togglePlayback() {
    if (canStop) {
      stop()
    } else if (streamUrl) {
      const audio = audioRef.current
      const attempt = Symbol()
      activeAttempt.current = attempt
      setPlayback('connecting')
      audio.src = streamUrl
      audio.play().catch(() => {
        if (activeAttempt.current === attempt) stop('error')
      })
    } else {
      refresh()
    }
  }

  function updatePlayback(nextState) {
    if (activeAttempt.current) setPlayback(nextState)
  }

  function playbackFailed() {
    if (activeAttempt.current) stop('error')
  }

  function playbackPaused(event) {
    const audio = event.currentTarget
    if (activeAttempt.current && audio.paused && !audio.ended) stop()
  }

  function changeVolume(event) {
    const nextVolume = event.currentTarget.valueAsNumber
    audioRef.current.volume = nextVolume
    setVolume(audioRef.current.volume)
    setMuted(false)
  }

  function toggleMute() {
    if (volume === 0) {
      audioRef.current.volume = 1
      setVolume(audioRef.current.volume)
      setMuted(false)
    } else {
      setMuted(previous => !previous)
    }
  }

  return {
    status, playback, canStop, muted, volume, togglePlayback, toggleMute, changeVolume,
    canPlay: Boolean(streamUrl),
    checking: state === 'loading' || state === 'retrying',
    audioProps: {
      ref: audioRef, preload: 'none', muted,
      onPlaying: () => updatePlayback('playing'),
      onWaiting: () => updatePlayback('buffering'),
      onPause: playbackPaused,
      onError: playbackFailed,
      onEnded: playbackFailed,
    },
  }
}

export function LiveStatus({ status }) {
  return <p className="stream-status" data-status={status} role="status">{streamLabels[status] ?? streamLabels.unknown}</p>
}

export function PlayButton({ radio, compact = false }) {
  const { canStop, canPlay, checking, playback, togglePlayback } = radio
  const label = canStop ? 'Stop listening'
    : checking && !canPlay ? 'Checking stream…'
    : !canPlay ? 'Retry stream'
    : playback === 'error' ? 'Try again'
    : 'Listen live'
  const Icon = canStop ? StopIcon : PlayIcon

  return (
    <button className={compact ? 'dock-play' : 'button button-accent hero-play'} type="button"
      disabled={checking && !canPlay} onClick={togglePlayback} aria-label={compact ? label : undefined}>
      <Icon size={compact ? 20 : 21} weight="fill" aria-hidden="true" />
      {compact ? null : label}
    </button>
  )
}

function SignalBars({ playing }) {
  return <span className="signal-bars" data-playing={playing} aria-hidden="true"><i /><i /><i /><i /></span>
}

export function PlayerDock({ radio, current, logoUrl }) {
  const programmeTitle = current?.programme?.title
  const silent = radio.muted || radio.volume === 0
  const VolumeIcon = silent ? SpeakerSlashIcon : SpeakerHighIcon
  const isPlaying = radio.playback === 'playing'
  const feedback = playbackLabels[radio.playback] ?? streamLabels[radio.status] ?? streamLabels.unknown

  return (
    <section className="player-dock" aria-label="Live radio player">
      <div className="dock-station">
        <img className="dock-art" src={logoUrl} alt="" width="710" height="327" />
        <div className="dock-station-text" aria-live="polite" aria-atomic="true">
          <p className="dock-title" title={programmeTitle}>{programmeTitle ?? 'CYI Radio'}</p>
          {programmeTitle ? (
            <p className="dock-subtitle dock-programme-status">
              <span className="dock-station-name">CYI Radio · </span>On now
            </p>
          ) : <p className="dock-subtitle">Live radio</p>}
        </div>
      </div>
      <div className="dock-transport">
        <SignalBars playing={isPlaying} />
        <PlayButton radio={radio} compact />
        <p className="dock-feedback" data-error={radio.playback === 'error'} role="status">{feedback}</p>
      </div>
      <div className="dock-volume">
        <button className="icon-button" type="button" aria-label="Mute audio" aria-pressed={silent} onClick={radio.toggleMute}>
          <VolumeIcon size={22} aria-hidden="true" />
        </button>
        <input className="volume-slider" aria-label="Volume" type="range" min="0" max="1" step=".01"
          value={silent ? 0 : radio.volume} onChange={radio.changeVolume} />
      </div>
      <audio {...radio.audioProps} />
    </section>
  )
}
