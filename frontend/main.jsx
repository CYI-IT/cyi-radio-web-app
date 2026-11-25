import React from 'react'
import { createRoot } from 'react-dom/client'
import { ListenerSchedule } from './listener-schedule.jsx'
import { RadioPlayer } from './radio-player.jsx'
import studioPhoto from './studio-microphone.jpg'
import './styles.css'

function App() {
  return (
    <>
      <header className="site-header">
        <div className="site-frame header-inner">
          <a className="station-brand" href="/">CYI Radio</a>
          <nav aria-label="Listener navigation">
            <a href="#listen">Listen</a>
            <a href="#schedule">Schedule</a>
          </nav>
        </div>
      </header>
      <main className="site-frame">
        <section id="listen" className="listen-hero" aria-labelledby="listen-heading">
          <div className="listen-content">
            <h1 id="listen-heading">Listen live</h1>
            <RadioPlayer />
          </div>
          <img className="studio-photo" src={studioPhoto} alt="" fetchPriority="high" />
        </section>
        <ListenerSchedule />
      </main>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
