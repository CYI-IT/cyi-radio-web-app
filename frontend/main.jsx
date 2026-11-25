import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BroadcastIcon } from '@phosphor-icons/react/Broadcast'
import { CalendarBlankIcon } from '@phosphor-icons/react/CalendarBlank'
import { ChatCircleDotsIcon } from '@phosphor-icons/react/ChatCircleDots'
import { HeadphonesIcon } from '@phosphor-icons/react/Headphones'
import { LinkSimpleIcon } from '@phosphor-icons/react/LinkSimple'
import { ShareNetworkIcon } from '@phosphor-icons/react/ShareNetwork'
import { XIcon } from '@phosphor-icons/react/X'
import { ListenerSchedule } from './listener-schedule.jsx'
import { ListenerChat } from './listener-chat.jsx'
import { LiveStatus, PlayButton, PlayerDock, useRadioPlayer } from './radio-player.jsx'
import { usePublicFeed } from './public-feed.js'
import studioPhoto from './studio-host.webp'
import './styles.css'

const sections = [
  { id: 'listen', label: 'Listen', Icon: HeadphonesIcon },
  { id: 'schedule', label: 'Schedule', Icon: CalendarBlankIcon },
  { id: 'chat', label: 'Chat', Icon: ChatCircleDotsIcon },
]

function currentSection() {
  return sections.find(section => `#${section.id}` === window.location.hash)?.id ?? 'listen'
}

function StationBrand({ onNavigate }) {
  return (
    <a className="station-brand" href="#listen" onClick={onNavigate}>
      <span className="station-mark"><BroadcastIcon size={23} weight="bold" aria-hidden="true" /></span>
      <span>CYI <span className="station-brand-radio">Radio</span></span>
    </a>
  )
}

function ShareStation() {
  const dialog = useRef(null)
  const link = useRef(null)
  const [feedback, setFeedback] = useState('')
  const url = new URL('/#listen', window.location.origin).href

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setFeedback('Link copied.')
    } catch {
      link.current.focus()
      link.current.select()
      setFeedback('Select and copy the station link.')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'CYI Radio', text: 'Listen live to CYI Radio', url })
      dialog.current.close()
    } catch (error) {
      if (error.name !== 'AbortError') setFeedback('You can copy the station link to share it.')
    }
  }

  return (
    <>
      <button className="button button-quiet share-button" type="button" onClick={() => {
        setFeedback('')
        dialog.current.showModal()
      }}>
        <ShareNetworkIcon size={18} aria-hidden="true" /> Share station
      </button>
      <dialog className="share-dialog" ref={dialog} aria-labelledby="share-heading">
        <form className="dialog-close" method="dialog">
          <button type="submit" className="icon-button" aria-label="Close sharing"><XIcon size={20} aria-hidden="true" /></button>
        </form>
        <h2 id="share-heading">Share CYI Radio</h2>
        <label className="visually-hidden" htmlFor="station-link">Station link</label>
        <input id="station-link" ref={link} value={url} readOnly />
        <div className="dialog-actions">
          <button className="button button-accent" type="button" onClick={copyLink}>
            <LinkSimpleIcon size={18} aria-hidden="true" /> Copy link
          </button>
          {typeof navigator.share === 'function' ? <button className="button button-quiet" type="button" onClick={share}>Share via…</button> : null}
        </div>
        <p className="share-feedback" role="status">{feedback}</p>
      </dialog>
    </>
  )
}

function App() {
  const [activeSection, setActiveSection] = useState(currentSection)
  const [chatOpen, setChatOpen] = useState(() => currentSection() === 'chat')
  const radio = useRadioPlayer()
  const schedule = usePublicFeed('/api/v1/schedule')
  const [pendingChatAnchor, setPendingChatAnchor] = useState(() => currentSection() === 'chat')
  const current = schedule.state === 'ready' ? schedule.data?.current : null

  useEffect(() => {
    const anchor = window.location.hash.slice(1)
    if (sections.some(section => section.id === anchor)) {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant' })
    }

    function syncNavigation() {
      const section = currentSection()
      setActiveSection(section)
      if (section === 'chat') {
        setChatOpen(true)
        setPendingChatAnchor(true)
      }
    }
    window.addEventListener('hashchange', syncNavigation)
    return () => window.removeEventListener('hashchange', syncNavigation)
  }, [])

  useEffect(() => {
    if (schedule.state === 'loading' || !pendingChatAnchor) return
    setPendingChatAnchor(false)
    if (window.location.hash !== '#chat') return
    const heading = document.getElementById('chat-heading')
    const dockTop = document.querySelector('.player-dock').getBoundingClientRect().top
    if (heading.getBoundingClientRect().bottom > dockTop) {
      document.getElementById('chat').scrollIntoView({ behavior: 'instant' })
    }
  }, [pendingChatAnchor, schedule.state])

  function navigate(section) {
    setActiveSection(section)
    if (section === 'chat') setChatOpen(true)
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="app-shell">
        <header className="station-header">
          <StationBrand onNavigate={() => navigate('listen')} />
          <nav className="station-nav" aria-label="Listener navigation">
            {sections.map(({ id, label, Icon }) => (
              <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => navigate(id)}>
                <Icon size={21} weight={activeSection === id ? 'fill' : 'regular'} aria-hidden="true" />
                {label}
              </a>
            ))}
          </nav>
        </header>
        <main className="site-frame" id="main" tabIndex={-1}>
          <div className="topbar">
            <ShareStation />
          </div>
          <section id="listen" className="listen-hero" aria-labelledby="listen-heading">
            <img className="studio-photo" src={studioPhoto} alt="" fetchPriority="high" />
            <div className="listen-content">
              <LiveStatus status={radio.status} />
              <h1 id="listen-heading">Find your<br /> <span>frequency.</span></h1>
              <p className="hero-description">Music, shows and conversations on CYI Radio.</p>
              <PlayButton radio={radio} />
            </div>
          </section>
          <div className="listener-grid">
            <ListenerSchedule feed={schedule} />
            <ListenerChat open={chatOpen} onToggle={() => setChatOpen(previous => !previous)} />
          </div>
        </main>
      </div>
      <PlayerDock radio={radio} current={current} />
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
