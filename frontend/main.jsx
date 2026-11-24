import React, { useEffect, useEffectEvent, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { io } from 'socket.io-client'
import './styles.css'

const transports = { auto: ['polling', 'websocket'], websocket: ['websocket'], polling: ['polling'] }

function App() {
  const [checks, setChecks] = useState({ health: 'Checking…', readiness: 'Checking…' })
  const [mode, setMode] = useState('auto')
  const [socket, setSocket] = useState(null)
  const [transport, setTransport] = useState('Disconnected')
  const [connected, setConnected] = useState(false)
  const [delivery, setDelivery] = useState('Waiting for a test message')
  const [sendResult, setSendResult] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal, cache: 'no-store' }
    async function inspect() {
      const [health, readiness] = await Promise.allSettled([
        fetch('/api/v1/health', options).then(async response => {
          if (!response.ok) throw new Error('Health check failed')
          const result = await response.json()
          return `Node.js ${result.node} · process ${result.bootId}`
        }),
        fetch('/api/v1/ready', options).then(response => response.ok ? 'Ready' : 'Unavailable'),
      ])
      if (!controller.signal.aborted) {
        setChecks({
          health: health.status === 'fulfilled' ? health.value : 'Unavailable',
          readiness: readiness.status === 'fulfilled' ? readiness.value : 'Unavailable',
        })
      }
    }
    inspect()
    return () => controller.abort()
  }, [])

  const disconnectOnUnmount = useEffectEvent(() => socket?.disconnect())
  useEffect(() => () => disconnectOnUnmount(), [])

  function connect() {
    setSendResult('')
    setTransport('Connecting…')
    const connection = io({ transports: transports[mode], reconnectionAttempts: 10, autoConnect: false })
    connection.on('connect', () => {
      setConnected(true)
      const { engine } = connection.io
      setTransport(engine.transport.name)
      engine.once('upgrade', upgraded => setTransport(upgraded.name))
    })
    connection.on('disconnect', reason => {
      setConnected(false)
      setTransport(`Disconnected (${reason})`)
    })
    connection.on('connect_error', error => setTransport(`Connection failed (${error.message})`))
    connection.on('phase0:delivery', ({ id, bootId }) => setDelivery(`${id} · process ${bootId}`))
    setSocket(connection)
    connection.connect()
  }

  function send() {
    setSendResult('Sending…')
    socket.timeout(5_000).emit('phase0:ping', crypto.randomUUID(), (error, response) => {
      setSendResult(error ? 'No acknowledgement received' : response.ok ? 'Acknowledged' : response.reason)
    })
  }

  function disconnect() {
    socket.disconnect()
    setSocket(null)
    setTransport('Disconnected')
  }

  return (
    <main>
      <h1>CYI Radio Hosting Probe</h1>
      <dl>
        <dt>Express API</dt><dd>{checks.health}</dd>
        <dt>Database</dt><dd>{checks.readiness}</dd>
      </dl>
      <h2>Socket.IO</h2>
      <div className="controls">
        <label htmlFor="transport">Transport</label>
        <select id="transport" value={mode} disabled={Boolean(socket)} onChange={event => setMode(event.target.value)}>
          <option value="auto">Automatic</option>
          <option value="websocket">WebSocket only</option>
          <option value="polling">Polling only</option>
        </select>
        {socket ? (
          <button onClick={disconnect}>Disconnect</button>
        ) : (
          <button onClick={connect}>Connect</button>
        )}
        <button disabled={!connected} onClick={send}>Send test message</button>
      </div>
      <dl aria-live="polite">
        <dt>Connection</dt><dd>{transport}</dd>
        <dt>Latest delivery</dt><dd>{delivery}</dd>
        <dt>Send status</dt><dd>{sendResult || 'Ready to test when connected'}</dd>
      </dl>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
