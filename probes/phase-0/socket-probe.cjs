const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { parseArgs } = require('node:util')
const { io } = require('socket.io-client')

const transports = { auto: ['polling', 'websocket'], websocket: ['websocket'], polling: ['polling'] }
const timeout = 10_000

function waitForEvent(socket, name, accepts = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener)
      reject(new Error(`Timed out waiting for ${name}`))
    }, timeout)
    function listener(value) {
      if (!accepts(value)) return
      clearTimeout(timer)
      socket.off(name, listener)
      resolve(value)
    }
    socket.on(name, listener)
  })
}

async function broadcast(sender, clients) {
  const id = randomUUID()
  const deliveries = clients.map(client => waitForEvent(client, 'phase0:delivery', value => value.id === id))
  const [acknowledgement, ...received] = await Promise.all([
    sender.timeout(timeout).emitWithAck('phase0:ping', id),
    ...deliveries,
  ])
  assert.equal(acknowledgement.ok, true, 'Server rejected the test event')
  assert.equal(new Set(received.map(delivery => delivery.bootId)).size, 1)
  console.log(`${id} delivered to ${received.length}/${clients.length} clients by ${received[0].bootId}`)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      clients: { type: 'string', default: '5' },
      seconds: { type: 'string', default: '120' },
      mode: { type: 'string', default: 'auto' },
    },
  })
  assert.equal(positionals.length, 1, 'Usage: npm run probe:socket -- <origin> [--mode auto|websocket|polling] [--clients 2–10] [--seconds 1–1800]')
  const url = new URL(positionals[0])
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Use HTTPS for hosted probes')
  assert.equal(url.href, `${url.origin}/`, 'Supply the probe origin without a path or credentials')

  const clientCount = Number(values.clients)
  const seconds = Number(values.seconds)
  assert.ok(Number.isInteger(clientCount) && clientCount >= 2 && clientCount <= 10, 'Use between 2 and 10 clients')
  assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 1800, 'Use between 1 and 1800 seconds')
  assert.ok(Object.hasOwn(transports, values.mode), 'Choose auto, websocket or polling')

  const health = await fetch(`${url.origin}/api/v1/health`, { signal: AbortSignal.timeout(timeout) })
  assert.ok(health.ok, `Health endpoint returned HTTP ${health.status}`)
  const result = await health.json()
  assert.equal(result.status, 'ok')
  console.log(`Node.js ${result.node} · HTTP process ${result.bootId}`)

  const issues = []
  const clients = Array.from({ length: clientCount }, (_, index) => {
    const socket = io(url.origin, {
      autoConnect: false,
      forceNew: true,
      transports: transports[values.mode],
      timeout,
      reconnectionDelay: 500,
    })
    socket.on('disconnect', reason => issues.push(`client ${index + 1} disconnected (${reason})`))
    socket.on('connect_error', error => issues.push(`client ${index + 1} connection error (${error.message})`))
    return socket
  })

  try {
    const connections = clients.map(client => waitForEvent(client, 'connect'))
    clients.forEach(client => client.connect())
    await Promise.all(connections)
    await broadcast(clients[0], clients)

    console.log(`Holding ${clients.length} connections open for ${seconds}s`)
    await delay(seconds * 1000)
    assert.deepEqual(issues, [], 'Unexpected connection interruptions')
    const activeTransports = clients.map(client => client.io.engine?.transport.name)
    assert.ok(activeTransports.every(name => transports[values.mode].includes(name)))
    console.log(`Active transports: ${activeTransports.join(', ')}`)
    await broadcast(clients[0], clients)

    const reconnecting = clients[0]
    const previousId = reconnecting.id
    const reconnected = waitForEvent(reconnecting, 'connect')
    reconnecting.io.engine.close()
    await reconnected
    assert.notEqual(reconnecting.id, previousId, 'Expected a fresh Socket.IO connection')
    await broadcast(clients[1], clients)
    assert.equal(issues.length, 1, 'Expected only the deliberate disconnect')
    assert.match(issues[0], /^client 1 disconnected /)
    console.log('Transport persistence, reconnection and message delivery passed')
  } catch (error) {
    if (issues.length) console.error(issues.join('\n'))
    throw error
  } finally {
    clients.forEach(client => client.disconnect())
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
