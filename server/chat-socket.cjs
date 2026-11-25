const { Server } = require('socket.io')
const { sameOrigin } = require('./chat-http.cjs')

function attachChatSocket(server, config) {
  const io = new Server(server, {
    path: '/api/v1/chat/socket.io',
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: 1024,
    allowRequest: (request, callback) => callback(null, sameOrigin(request, config) && io.engine.clientsCount < 100),
  })

  // WebSocket clients receive a wakeup. All message reads and writes use the REST routes.
  io.on('connection', socket => socket.onAny(() => socket.disconnect(true)))
  return io
}

module.exports = { attachChatSocket }
