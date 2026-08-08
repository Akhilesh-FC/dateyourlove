const { Server } = require('socket.io');
const db = require('../config/db');
const chatService = require('../services/chatService');
const { messaging } = require('./firebase');
let io = null;
const onlineUsers = new Map();

function getUserEntry(userId) {
  const normalizedUserId = String(userId);
  return onlineUsers.get(normalizedUserId) || null;
}

function setUserSocket(userId, socketId) {
  const normalizedUserId = String(userId);
  const entry = onlineUsers.get(normalizedUserId);
  if (!entry) {
    onlineUsers.set(normalizedUserId, { socketIds: new Set([socketId]), activeRoomId: null });
    return;
  }
  entry.socketIds.add(socketId);
}

function removeUserSocket(userId, socketId) {
  const normalizedUserId = String(userId);
  const entry = onlineUsers.get(normalizedUserId);
  if (!entry) return;
  entry.socketIds.delete(socketId);
  if (!entry.socketIds.size) {
    onlineUsers.delete(normalizedUserId);
  }
}

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
      setUserSocket(normalizedUserId, socket.id);

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

    const setActiveRoom = (data, callback) => {
      const senderId = socket.data.userId;
      if (!senderId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'You must join before setting the active room' });
        }
        return;
      }
      const roomId = data?.roomId || data?.room || data?.chatRoom || data?.room_id || data?.roomID;
      const normalizedRoomId = roomId ? String(roomId).trim() : null;
      const entry = getUserEntry(senderId);
      if (entry) {
        entry.activeRoomId = normalizedRoomId;
      }
      if (typeof callback === 'function') {
        callback({ success: true, roomId: normalizedRoomId });
      }
    };

    const clearActiveRoom = (callback) => {
      const senderId = socket.data.userId;
      if (!senderId) {
        if (typeof callback === 'function') {
          return callback({ success: false, message: 'You must join before clearing the active room' });
        }
        return;
      }
      const entry = getUserEntry(senderId);
      if (entry) {
        entry.activeRoomId = null;
      }
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    };

    socket.on('active_room', setActiveRoom);
    socket.on('enter_room', setActiveRoom);
    socket.on('set_active_room', setActiveRoom);
    socket.on('room_active', setActiveRoom);
    socket.on('clear_active_room', clearActiveRoom);
    socket.on('leave_room', clearActiveRoom);
    socket.on('clear_room', clearActiveRoom);
    socket.on('room_inactive', clearActiveRoom);

    socket.on('chat_message', async (data, callback) => {
      try {
        const senderId = Number(socket.data.userId);
        if (!senderId) {
          return typeof callback === 'function' && callback({ success: false, error: 'User not joined.' });
        }

        const { roomId: rawRoomId, receiverId, message, imageUrl } = data || {};
        const roomId = rawRoomId ? String(rawRoomId).trim() : '';
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
        removeUserSocket(userId, socket.id);
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
  const entry = getUserEntry(userId);
  if (!entry) return false;
  return Boolean(entry.activeRoomId && String(entry.activeRoomId).trim() === String(roomId).trim());
}

async function notifyUserMessage(userId, senderId, roomId, messageText) {
  if (isUserActiveInRoom(userId, roomId)) {
    return false;
  }

  const ioInstance = getIo();
  const normalizedRoomId = roomId ? String(roomId).trim() : '';
  const payload = {
    type: 'message',
    fromId: String(senderId),
    roomId: normalizedRoomId,
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
