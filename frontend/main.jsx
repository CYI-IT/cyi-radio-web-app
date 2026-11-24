import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main>
      <h1>CYI Radio</h1>
      <p>Online radio</p>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
