const { Server } = require('socket.io');
let io = null;
const onlineUsers = new Map();

/**
 * Initialise Socket.io with the HTTP server.
 * Call this once from server.js after the http server is created.
 */
function initSocket(server) {
  io = new Server(server);

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('join', ({ userId }) => {
      const normalizedUserId = String(userId);
      socket.data.userId = normalizedUserId;
      socket.join(`user_${normalizedUserId}`);
      onlineUsers.set(normalizedUserId, socket.id);
      io.emit('presence', { userId: normalizedUserId, status: 'online' });
    });

    socket.on('like', ({ fromId, toId }) => {
      console.log(`like: ${fromId} -> ${toId}`);
      io.to(`user_${toId}`).emit('liked', { fromId, toId });
    });

    socket.on('message', ({ fromId, toId, text }) => {
      console.log(`message from ${fromId} to ${toId}: ${text}`);
      io.to(`user_${toId}`).emit('message', { fromId, toId, text });
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        onlineUsers.delete(userId);
        io.emit('presence', { userId, status: 'offline' });
      }
      console.log('disconnected', socket.id);
    });
  });

  return io;
}

function getIo() {
  return io;
}

function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}

function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

module.exports = { initSocket, getIo, isUserOnline, getOnlineUsers };
