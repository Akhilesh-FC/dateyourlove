const db = require('../../config/db');
const { buildUserPayload } = require('../../controllers/Api/userController');
const { toFullUrl } = require('../../utils/appHelpers');
const { getIo, isUserOnline, isUserActiveInRoom, notifyUserMessage } = require('../../config/socket');
const chatService = require('../../services/chatService');
const { isUserBlockedBetween } = require('../../utils/blockHelpers');

async function userHasActiveSubscription(userId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM user_subscriptions
     WHERE user_id = ?
       AND status = 'active'
       AND start_date <= CURDATE()
       AND end_date >= CURDATE()`,
    [userId]
  );
  return Number(rows[0]?.count || 0) > 0;
}

const generateRoomId = (user1Id, user2Id) => {
  const first = Number(user1Id);
  const second = Number(user2Id);
  const smaller = Math.min(first, second);
  const larger = Math.max(first, second);
  return `room_${smaller}_${larger}`;
};

exports.generateRoomId = generateRoomId;

exports.ensureChatRoomForUsers = async (user1Id, user2Id) => {
  try {
    if (!user1Id || !user2Id || Number(user1Id) === Number(user2Id)) {
      return null;
    }

    const roomId = generateRoomId(user1Id, user2Id);
    const firstUserId = Math.min(Number(user1Id), Number(user2Id));
    const secondUserId = Math.max(Number(user1Id), Number(user2Id));

    const [existingMatchRows] = await db.query(
      `SELECT id FROM matches
       WHERE (user1_id = ? AND user2_id = ?)
          OR (user1_id = ? AND user2_id = ?)
       LIMIT 1`,
      [firstUserId, secondUserId, secondUserId, firstUserId]
    );

    if (!existingMatchRows.length) {
      await db.query(
        `INSERT INTO matches (user1_id, user2_id, room_id)
         VALUES (?, ?, ?)`,
        [firstUserId, secondUserId, roomId]
      );
    } else {
      await db.query(
        `UPDATE matches SET room_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [roomId, existingMatchRows[0].id]
      );
    }

    await db.query(
      `INSERT INTO chat_rooms (room_id, user1_id, user2_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [roomId, firstUserId, secondUserId]
    );

    return { roomId, user1Id: firstUserId, user2Id: secondUserId };
  } catch (err) {
    console.error('ENSURE CHAT ROOM ERROR:', err.message);
    return null;
  }
};

exports.getChatRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT cr.room_id, cr.user1_id, cr.user2_id, cr.created_at, cr.updated_at,
              u.id, u.first_name, u.about, u.gender, u.dob, u.email, u.mobile,
              u.created_at AS user_created_at, u.updated_at AS user_updated_at,
              COALESCE(lm.last_message_at, cr.updated_at) AS last_activity_at
       FROM chat_rooms cr
       LEFT JOIN (
         SELECT room_id, MAX(created_at) AS last_message_at
         FROM chat_messages
         GROUP BY room_id
       ) lm ON lm.room_id = cr.room_id
       JOIN users u ON u.id = CASE
         WHEN cr.user1_id = ? THEN cr.user2_id
         ELSE cr.user1_id
       END
       WHERE cr.user1_id = ? OR cr.user2_id = ?
       ORDER BY last_activity_at DESC`,
      [userId, userId, userId]
    );

    const roomIds = rows.map((row) => row.room_id);
    const unreadCounts = new Map();
    const lastMessages = new Map();

    if (roomIds.length) {
      const placeholders = roomIds.map(() => '?').join(',');
      const [unreadRows] = await db.query(
        `SELECT room_id, COUNT(*) AS unread_count
         FROM chat_messages
         WHERE room_id IN (${placeholders})
           AND is_seen = 0
           AND receiver_id = ?
         GROUP BY room_id`,
        [...roomIds, userId]
      );
      for (const row of unreadRows) {
        unreadCounts.set(row.room_id, Number(row.unread_count || 0));
      }

      const [lastMessageRows] = await db.query(
        `SELECT cm.*
         FROM chat_messages cm
         JOIN (
           SELECT room_id, MAX(id) AS max_id
           FROM chat_messages
           WHERE room_id IN (${placeholders})
           GROUP BY room_id
         ) latest ON cm.room_id = latest.room_id AND cm.id = latest.max_id`,
        roomIds
      );
      const formattedLastMessages = chatService.formatChatMessages(lastMessageRows);
      for (const message of formattedLastMessages) {
        lastMessages.set(message.room_id, message);
      }
    }

    const rooms = [];
    for (const row of rows) {
      const otherUserId = Number(row.user1_id) === Number(userId) ? Number(row.user2_id) : Number(row.user1_id);
      const [canReplyRows] = await db.query(
        `SELECT COUNT(*) AS count
         FROM user_subscriptions
         WHERE user_id = ?
           AND status = 'active'
           AND start_date <= CURDATE()
           AND end_date >= CURDATE()`,
        [userId]
      );
      const canReply = Number(canReplyRows[0]?.count || 0) > 0;
      const otherUserCanReply = await userHasActiveSubscription(otherUserId);
      const otherUser = buildUserPayload(row);
      try {
        const [photoRows] = await db.query(
          'SELECT id, url FROM user_photos WHERE user_id = ? ORDER BY is_required DESC, id ASC',
          [otherUserId]
        );
        otherUser.images = photoRows.map((p) => toFullUrl(p.url));
      } catch (photoErr) {
        otherUser.images = [];
      }
      const lastVideoCall = await chatService.getLastVideoCallBetweenUsers(userId, otherUserId);
      const userIsBlocked = await isUserBlockedBetween(userId, otherUserId);
      rooms.push({
        roomId: row.room_id,
        otherUser,
        canReply,
        otherUserCanReply,
        active_plan: otherUserCanReply ? 'yes' : 'no',
        useris_blocked: userIsBlocked ? 'yes' : 'no',
        isOnline: isUserOnline(otherUserId),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        unreadCount: unreadCounts.get(row.room_id) || 0,
        lastMessage: lastMessages.get(row.room_id) || null,
        lastVideoCall,
      });
    }

    rooms.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.updatedAt;
      const bTime = b.lastMessage?.created_at || b.updatedAt;
      return new Date(bTime) - new Date(aTime);
    });

    return res.status(200).json({ count: rooms.length, rooms });
  } catch (err) {
    console.error('GET CHAT ROOMS ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch chat rooms' });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const page = req.query.page || 1;
    const limit = req.query.limit || 30;

    const room = await chatService.getRoomForUser(roomId, userId);
    if (!room) {
      return res.status(404).json({ message: 'Chat room not found or access denied' });
    }

    const hasActivePlan = await chatService.userHasActiveSubscription(userId);
    if (!hasActivePlan) {
      return res.status(403).json({ message: 'You need an active plan to view chat messages.' });
    }

    const history = await chatService.getChatMessagesByRoom(roomId, page, limit);
    const videoCalls = await chatService.getVideoCallsByRoom(roomId);
    return res.status(200).json({
      roomId,
      page: history.page,
      limit: history.limit,
      total: history.total,
      canReply: true,
      messages: history.messages,
      videoCalls,
    });
  } catch (err) {
    console.error('GET CHAT MESSAGES ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const rawRoomId = req.body.roomId || req.body.room || req.body.chatRoom || req.body.room_id || req.body.roomID;
    const roomId = rawRoomId ? String(rawRoomId).trim() : '';
    const { receiverId, message } = req.body;
    const imageUrl = req.body.image_url || req.body.imageUrl || null;

    if (!roomId || !receiverId || (!message && !imageUrl)) {
      return res.status(400).json({ message: 'roomId, receiverId and message or image_url are required' });
    }

    const room = await chatService.getRoomForUser(roomId, senderId);
    if (!room) {
      return res.status(404).json({ message: 'Chat room not found or access denied' });
    }

    const senderHasPlan = await chatService.userHasActiveSubscription(senderId);
    if (!senderHasPlan) {
      return res.status(403).json({ message: 'You need an active plan to send messages.' });
    }

    const blocked = await isUserBlockedBetween(senderId, Number(receiverId));
    if (blocked) {
      return res.status(403).json({ message: 'Message cannot be sent because one user has blocked the other.' });
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

    const io = getIo();
    const payload = {
      ...insertedMessage,
      roomId,
      receiverHasPlan,
      suppressNotification: isUserActiveInRoom(Number(receiverId), roomId),
    };

    let delivered = false;
    if (io) {
      io.to(`user_${receiverId}`).emit('message', payload);
      await notifyUserMessage(Number(receiverId), senderId, roomId, message || (imageUrl ? 'sent a photo' : 'New message received'));
      if (isUserOnline(Number(receiverId))) {
        await db.query(`UPDATE chat_messages SET is_delivered = 1 WHERE id = ?`, [insertedMessage.id]);
        delivered = true;
        io.to(`user_${senderId}`).emit('message_status', {
          messageId: insertedMessage.id,
          status: 'delivered',
          roomId,
        });
      }
      try {
        // Emit updated room summary to both participants so clients can update room lists
        const summaryForReceiver = await chatService.buildRoomSummary(roomId, Number(receiverId));
        const summaryForSender = await chatService.buildRoomSummary(roomId, Number(senderId));
        if (summaryForReceiver) io.to(`user_${receiverId}`).emit('room_update', summaryForReceiver);
        if (summaryForSender) io.to(`user_${senderId}`).emit('room_update', summaryForSender);
      } catch (emitErr) {
        console.error('ROOM UPDATE EMIT ERROR:', emitErr && emitErr.message ? emitErr.message : emitErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Message sent',
      messageId: insertedMessage.id,
      roomId,
      receiverHasPlan,
      delivered,
      payload,
    });
  } catch (err) {
    console.error('SEND CHAT MESSAGE ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to send message' });
  }
};

exports.uploadChatImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const imageUrl = `/uploads/photos/${req.file.filename}`;
    return res.status(200).json({ success: true, image_url: imageUrl, full_url: `${process.env.BASE_URL || 'http://localhost:3001'}${imageUrl}` });
  } catch (err) {
    console.error('UPLOAD CHAT IMAGE ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to upload image' });
  }
};

exports.markMessageDelivered = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const [rows] = await db.query(
      `SELECT sender_id, receiver_id, room_id FROM chat_messages WHERE id = ? LIMIT 1`,
      [messageId]
    );

    if (!rows.length || Number(rows[0].receiver_id) !== Number(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const receiverHasPlan = await chatService.userHasActiveSubscription(userId);
    if (!receiverHasPlan) {
      return res.status(403).json({ message: 'You need an active plan to mark messages as delivered.' });
    }

    await db.query(
      `UPDATE chat_messages SET is_delivered = 1 WHERE id = ?`,
      [messageId]
    );

    const io = getIo();
    if (io) {
      io.to(`user_${rows[0].sender_id}`).emit('message_status', {
        messageId,
        status: 'delivered',
        roomId: rows[0].room_id,
      });
    }

    return res.status(200).json({ message: 'Delivered updated' });
  } catch (err) {
    console.error('MARK DELIVERED ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to update delivery status' });
  }
};

exports.markMessageSeen = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const [rows] = await db.query(
      `SELECT sender_id, receiver_id, room_id FROM chat_messages WHERE id = ? LIMIT 1`,
      [messageId]
    );

    if (!rows.length || Number(rows[0].receiver_id) !== Number(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const receiverHasPlan = await chatService.userHasActiveSubscription(userId);
    if (!receiverHasPlan) {
      return res.status(403).json({ message: 'You need an active plan to mark messages as seen.' });
    }

    await db.query(
      `UPDATE chat_messages SET is_seen = 1 WHERE id = ?`,
      [messageId]
    );

    const io = getIo();
    if (io) {
      io.to(`user_${rows[0].sender_id}`).emit('message_status', {
        messageId,
        status: 'seen',
        roomId: rows[0].room_id,
      });
    }

    return res.status(200).json({ message: 'Seen updated' });
  } catch (err) {
    console.error('MARK SEEN ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to update seen status' });
  }
};
