const db = require('../config/db');
const { toFullUrl } = require('../utils/appHelpers');
const { buildUserPayload } = require('../controllers/Api/userController');

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

async function buildRoomSummary(roomId, userId) {
  const [roomRows] = await db.query(
    `SELECT room_id, user1_id, user2_id, created_at, updated_at
     FROM chat_rooms WHERE room_id = ? LIMIT 1`,
    [roomId]
  );
  if (!roomRows.length) return null;

  const roomRow = roomRows[0];
  const otherUserId = Number(roomRow.user1_id) === Number(userId)
    ? Number(roomRow.user2_id)
    : Number(roomRow.user1_id);

  const [userRows] = await db.query(
    `SELECT * FROM users WHERE id = ? LIMIT 1`,
    [otherUserId]
  );
  const otherUser = userRows.length ? buildUserPayload(userRows[0]) : null;

  if (otherUser) {
    const [photoRows] = await db.query(
      'SELECT id, url FROM user_photos WHERE user_id = ? ORDER BY is_required DESC, id ASC',
      [otherUserId]
    );
    otherUser.images = photoRows.map((p) => toFullUrl(p.url));
  }

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

  const [unreadRows] = await db.query(
    `SELECT COUNT(*) AS unread_count FROM chat_messages WHERE room_id = ? AND receiver_id = ? AND is_seen = 0`,
    [roomId, userId]
  );
  const unreadCount = Number(unreadRows[0]?.unread_count || 0);

  const [lastRows] = await db.query(
    `SELECT * FROM chat_messages WHERE room_id = ? ORDER BY id DESC LIMIT 1`,
    [roomId]
  );
  const lastMessage = lastRows.length ? formatChatMessages(lastRows)[0] : null;

  return {
    roomId: roomRow.room_id,
    otherUser,
    canReply,
    otherUserCanReply,
    isOnline: false,
    createdAt: roomRow.created_at,
    updatedAt: roomRow.updated_at,
    unreadCount,
    lastMessage,
  };
}

async function getChatMessagesByRoom(roomId, page = 1, limit = 20) {
  const safeLimit = Number(limit) > 0 ? Math.min(Number(limit), 100) : 20;
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const offset = (safePage - 1) * safeLimit;

  const [messageRows] = await db.query(
    `SELECT *
     FROM chat_messages
     WHERE room_id = ?
     ORDER BY created_at DESC, id DESC
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
    messages: formatChatMessages(messageRows.reverse()),
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
  buildRoomSummary,
  getChatMessagesByRoom,
  insertChatMessage,
  formatChatMessages,
};
