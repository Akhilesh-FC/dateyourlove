const { Server } = require('socket.io');
let io = null;

/**
 * Initialise Socket.io with the HTTP server.
 * Call this once from server.js after the http server is created.
 */
function initSocket(server) {
  io = new Server(server);

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('join', ({ userId }) => {
      socket.join(`user_${userId}`);
    });

    socket.on('like', ({ fromId, toId }) => {
      console.log(`like: ${fromId} -> ${toId}`);
      io.to(`user_${toId}`).emit('liked', { fromId, toId });
    });

    socket.on('message', ({ fromId, toId, text }) => {
      console.log(`message from ${fromId} to ${toId}: ${text}`);
      io.to(`user_${toId}`).emit('message', { fromId, toId, text });
    });

    socket.on('disconnect', () => console.log('disconnected', socket.id));
  });

  return io;
}

function getIo() {
  return io;
}

module.exports = { initSocket, getIo };
