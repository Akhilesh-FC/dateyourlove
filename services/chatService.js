const db = require('../config/db');
const { toFullUrl } = require('../utils/appHelpers');

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

async function getRoomForUser(roomId, userId) {
  const [rows] = await db.query(
    `SELECT room_id, user1_id, user2_id
     FROM chat_rooms
     WHERE room_id = ?
     LIMIT 1`,
    [roomId]
  );
  if (!rows.length) return null;
  const room = rows[0];
  if (room.user1_id !== Number(userId) && room.user2_id !== Number(userId)) {
    return null;
  }
  return room;
}

async function getChatMessagesByRoom(roomId, page = 1, limit = 20) {
  const safeLimit = Number(limit) > 0 ? Math.min(Number(limit), 100) : 20;
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const offset = (safePage - 1) * safeLimit;

  const [messageRows] = await db.query(
    `SELECT *
     FROM chat_messages
     WHERE room_id = ?
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`,
    [roomId, safeLimit, offset]
  );

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM chat_messages
     WHERE room_id = ?`,
    [roomId]
  );

  return {
    messages: formatChatMessages(messageRows),
    total: Number(countRows[0]?.total || 0),
    page: safePage,
    limit: safeLimit,
  };
}

async function insertChatMessage({ roomId, senderId, receiverId, message, imageUrl, isDelivered = 0, isSeen = 0 }) {
  const [result] = await db.query(
    `INSERT INTO chat_messages
       (room_id, sender_id, receiver_id, message, image_url, is_delivered, is_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [roomId, senderId, receiverId, message, imageUrl, isDelivered, isSeen]
  );

  const [rows] = await db.query(
    `SELECT * FROM chat_messages WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  if (!rows.length) return null;
  return formatChatMessages(rows)[0];
}

function formatChatMessages(rows) {
  return rows.map((row) => ({
    ...row,
    image_url: toFullUrl(row.image_url),
  }));
}

module.exports = {
  userHasActiveSubscription,
  getRoomForUser,
  getChatMessagesByRoom,
  insertChatMessage,
  formatChatMessages,
};
