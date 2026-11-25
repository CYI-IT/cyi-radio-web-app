import React from 'react'
import { createRoot } from 'react-dom/client'
import { RadioPlayer } from './radio-player.jsx'
import './styles.css'

function App() {
  return (
    <main>
      <h1>CYI Radio</h1>
      <RadioPlayer />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
