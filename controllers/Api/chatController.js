const db = require('../../config/db');
const { buildUserPayload } = require('../../controllers/Api/userController');
const { getIo, isUserOnline } = require('../../config/socket');

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
              u.created_at AS user_created_at, u.updated_at AS user_updated_at
       FROM chat_rooms cr
       JOIN users u ON u.id = CASE
         WHEN cr.user1_id = ? THEN cr.user2_id
         ELSE cr.user1_id
       END
       WHERE cr.user1_id = ? OR cr.user2_id = ?
       ORDER BY cr.updated_at DESC`,
      [userId, userId, userId]
    );

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
      rooms.push({
        roomId: row.room_id,
        otherUser,
        canReply,
        otherUserCanReply,
        isOnline: isUserOnline(otherUserId),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

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

    const [roomRows] = await db.query(
      `SELECT room_id, user1_id, user2_id FROM chat_rooms WHERE room_id = ? LIMIT 1`,
      [roomId]
    );

    if (!roomRows.length) {
      return res.status(404).json({ message: 'Chat room not found' });
    }

    const room = roomRows[0];
    if (room.user1_id !== userId && room.user2_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [messageRows] = await db.query(
      `SELECT * FROM chat_messages WHERE room_id = ? ORDER BY created_at ASC`,
      [roomId]
    );

    const canReply = await userHasActiveSubscription(userId);
    return res.status(200).json({ roomId, canReply, messages: messageRows });
  } catch (err) {
    console.error('GET CHAT MESSAGES ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { roomId, receiverId, message } = req.body;

    if (!roomId || !receiverId || !message) {
      return res.status(400).json({ message: 'roomId, receiverId and message are required' });
    }

    const [roomRows] = await db.query(
      `SELECT room_id, user1_id, user2_id FROM chat_rooms WHERE room_id = ? LIMIT 1`,
      [roomId]
    );

    if (!roomRows.length) {
      return res.status(404).json({ message: 'Chat room not found' });
    }

    const room = roomRows[0];
    if (room.user1_id !== senderId && room.user2_id !== senderId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const senderHasPlan = await userHasActiveSubscription(senderId);
    if (!senderHasPlan) {
      return res.status(403).json({ message: 'You need an active plan to send messages.' });
    }

    const receiverHasPlan = await userHasActiveSubscription(Number(receiverId));
    const canReply = receiverHasPlan;

    const insertedMessage = {
      room_id: roomId,
      sender_id: senderId,
      receiver_id: Number(receiverId),
      message: String(message),
      is_delivered: 0,
      is_seen: 0,
    };

    const [result] = await db.query(
      `INSERT INTO chat_messages (room_id, sender_id, receiver_id, message, is_delivered, is_seen)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [insertedMessage.room_id, insertedMessage.sender_id, insertedMessage.receiver_id, insertedMessage.message, insertedMessage.is_delivered, insertedMessage.is_seen]
    );

    const io = getIo();
    const payload = {
      roomId,
      messageId: result.insertId,
      senderId,
      receiverId: Number(receiverId),
      message: insertedMessage.message,
      canReply,
      sentAt: new Date().toISOString(),
    };

    if (io) {
      io.to(`user_${receiverId}`).emit('message', payload);
      if (isUserOnline(Number(receiverId))) {
        await db.query(`UPDATE chat_messages SET is_delivered = 1 WHERE id = ?`, [result.insertId]);
        io.to(`user_${senderId}`).emit('message_status', { messageId: result.insertId, status: 'delivered', roomId });
      }
    }

    return res.status(200).json({
      message: 'Message sent',
      messageId: result.insertId,
      roomId,
      canReply,
      delivered: isUserOnline(Number(receiverId)),
    });
  } catch (err) {
    console.error('SEND CHAT MESSAGE ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to send message' });
  }
};

exports.markMessageDelivered = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await db.query(
      `UPDATE chat_messages SET is_delivered = 1 WHERE id = ? AND receiver_id = ?`,
      [messageId, userId]
    );

    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('message_status', { messageId, status: 'delivered' });
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

    await db.query(
      `UPDATE chat_messages SET is_seen = 1 WHERE id = ? AND receiver_id = ?`,
      [messageId, userId]
    );

    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('message_status', { messageId, status: 'seen' });
    }

    return res.status(200).json({ message: 'Seen updated' });
  } catch (err) {
    console.error('MARK SEEN ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to update seen status' });
  }
};
