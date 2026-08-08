const { Server } = require('socket.io');
const db = require('../config/db');
const chatService = require('../services/chatService');
const { messaging } = require('./firebase');
let io = null;
const onlineUsers = new Map();

/**
 * Initialise Socket.io with the HTTP server.
 * Call this once from server.js after the http server is created.
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('join', ({ userId }, callback) => {
      if (!userId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'userId is required for join' });
        }
        return;
      }

      const normalizedUserId = String(userId);
      socket.data.userId = normalizedUserId;
      socket.join(`user_${normalizedUserId}`);
      onlineUsers.set(normalizedUserId, { socketId: socket.id, activeRoomId: null });

      const existingOnlineUserIds = getOnlineUsers().filter((id) => id !== normalizedUserId);
      if (existingOnlineUserIds.length) {
        socket.emit('presence_snapshot', {
          users: existingOnlineUserIds.map((id) => ({ userId: id, status: 'online' })),
        });
      }

      io.emit('presence', { userId: normalizedUserId, status: 'online' });

      if (typeof callback === 'function') {
        callback({ success: true, message: 'Joined successfully', userId: normalizedUserId });
      }
    });

    socket.on('typing', ({ roomId, receiverId, isTyping }, callback) => {
      const senderId = socket.data.userId;
      if (!senderId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'You must join before sending typing events' });
        }
        return;
      }

      if (!roomId || !receiverId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'roomId and receiverId are required' });
        }
        return;
      }

      io.to(`user_${receiverId}`).emit('typing', {
        roomId,
        senderId,
        isTyping: Boolean(isTyping),
      });

      if (typeof callback === 'function') {
        callback({ success: true, message: 'Typing event sent', roomId, receiverId, isTyping: Boolean(isTyping) });
      }
    });

    socket.on('active_room', ({ roomId }, callback) => {
      const senderId = socket.data.userId;
      if (!senderId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'You must join before setting the active room' });
        }
        return;
      }
      const entry = onlineUsers.get(senderId);
      if (entry) {
        entry.activeRoomId = roomId || null;
      }
      if (typeof callback === 'function') {
        callback({ success: true, roomId: roomId || null });
      }
    });

    socket.on('clear_active_room', (callback) => {
      const senderId = socket.data.userId;
      if (!senderId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'You must join before clearing the active room' });
        }
        return;
      }
      const entry = onlineUsers.get(senderId);
      if (entry) {
        entry.activeRoomId = null;
      }
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    });

    socket.on('chat_message', async (data, callback) => {
      try {
        const senderId = Number(socket.data.userId);
        if (!senderId) {
          return typeof callback === 'function' && callback({ success: false, error: 'User not joined.' });
        }

        const { roomId, receiverId, message, imageUrl } = data || {};
        if (!roomId || !receiverId || (!message && !imageUrl)) {
          return typeof callback === 'function' && callback({ success: false, error: 'roomId, receiverId, and message or imageUrl are required.' });
        }

        const room = await chatService.getRoomForUser(roomId, senderId);
        if (!room) {
          return typeof callback === 'function' && callback({ success: false, error: 'Chat room not found or access denied.' });
        }

        const senderHasPlan = await chatService.userHasActiveSubscription(senderId);
        if (!senderHasPlan) {
          return typeof callback === 'function' && callback({ success: false, error: 'You need an active plan to send messages.' });
        }

        const receiverHasPlan = await chatService.userHasActiveSubscription(Number(receiverId));
        const insertedMessage = await chatService.insertChatMessage({
          roomId,
          senderId,
          receiverId: Number(receiverId),
          message: message ? String(message) : null,
          imageUrl: imageUrl ? String(imageUrl) : null,
          isDelivered: 0,
          isSeen: 0,
        });

        const isReceiverOnline = isUserOnline(Number(receiverId));
        if (isReceiverOnline) {
          await db.query(`UPDATE chat_messages SET is_delivered = 1 WHERE id = ?`, [insertedMessage.id]);
          insertedMessage.is_delivered = 1;
          io.to(`user_${senderId}`).emit('message_status', {
            messageId: insertedMessage.id,
            status: 'delivered',
            roomId,
          });
        }

        io.to(`user_${receiverId}`).emit('message', {
          ...insertedMessage,
          receiverHasPlan,
        });
        await notifyUserMessage(Number(receiverId), senderId, roomId, message || (imageUrl ? 'sent a photo' : 'New message received'));

        try {
          const summaryForReceiver = await chatService.buildRoomSummary(roomId, Number(receiverId));
          const summaryForSender = await chatService.buildRoomSummary(roomId, Number(senderId));
          if (summaryForReceiver) {
            summaryForReceiver.isOnline = isUserOnline(senderId);
            io.to(`user_${receiverId}`).emit('room_update', summaryForReceiver);
          }
          if (summaryForSender) {
            summaryForSender.isOnline = isUserOnline(receiverId);
            io.to(`user_${senderId}`).emit('room_update', summaryForSender);
          }
        } catch (emitErr) {
          console.error('ROOM UPDATE EMIT ERROR:', emitErr && emitErr.message ? emitErr.message : emitErr);
        }

        return typeof callback === 'function' && callback({
          success: true,
          message: 'Message sent',
          delivered: isReceiverOnline,
          messageId: insertedMessage.id,
          roomId,
          receiverHasPlan,
        });
      } catch (err) {
        console.error('SOCKET CHAT MESSAGE ERROR:', err);
        return typeof callback === 'function' && callback({ success: false, error: err.message || 'Unable to send message' });
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const entry = onlineUsers.get(userId);
        if (entry && entry.socketId === socket.id) {
          onlineUsers.delete(userId);
        }
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

function isUserActiveInRoom(userId, roomId) {
  const entry = onlineUsers.get(String(userId));
  return Boolean(entry && entry.activeRoomId && entry.activeRoomId === roomId);
}

async function notifyUserMessage(userId, senderId, roomId, messageText) {
  if (isUserActiveInRoom(userId, roomId)) {
    return false;
  }

  const ioInstance = getIo();
  const payload = {
    type: 'message',
    fromId: String(senderId),
    roomId,
    message: messageText ? String(messageText).slice(0, 120) : 'New message received',
  };

  if (ioInstance) {
    ioInstance.to(`user_${userId}`).emit('notification', payload);
  }

  try {
    const [rows] = await db.query('SELECT fcm_token FROM users WHERE id = ? LIMIT 1', [userId]);
    const token = rows[0] ? rows[0].fcm_token : null;
    if (token) {
      await messaging.send({
        token,
        notification: {
          title: 'New message',
          body: payload.message,
        },
        data: {
          type: 'message',
          roomId,
          fromId: String(senderId),
        },
      });
    }
  } catch (err) {
    console.error('MESSAGE NOTIFICATION ERROR:', err && err.message ? err.message : err);
  }

  return true;
}

function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

module.exports = { initSocket, getIo, isUserOnline, getOnlineUsers, isUserActiveInRoom, notifyUserMessage };
