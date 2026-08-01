const db = require('../../config/db');
const { messaging } = require('../../config/firebase'); // Firebase Admin messaging
const { getIo } = require('../../config/socket'); // socket.io getter
const { toFullUrl } = require('../../utils/appHelpers');
const { buildUserPayload } = require('../../controllers/Api/userController');

/** Helper – emit a socket.io notification */
const emitSocketNotification = (targetUserId, payload) => {
  const io = getIo();
  if (io) {
    io.to(`user_${targetUserId}`).emit('notification', payload);
  } else {
    console.warn('Socket.io not initialized');
  }
};

/** Helper – send an FCM push notification */
// const sendFcm = async (fcmToken, title, body) => {
//   if (!fcmToken) return; // no token → nothing to send
//   const message = {
//     token: fcmToken,
//     notification: { title, body },
//     data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
//   };
//   try {
//     await messaging.send(message);
//     console.log('✅ FCM sent to token', fcmToken);
//   } catch (err) {
//     console.error('❌ FCM error:', err);
//   }
// };

const sendFcm = async (fcmToken, title, body) => {
  if (!fcmToken) {
    console.warn('⚠️ No FCM token found, skipping push notification');
    return;
  }
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
  };
  try {
    const response = await messaging.send(message);
    console.log('✅ FCM sent successfully:', response);
  } catch (err) {
    console.error('❌ FCM error:', err.message || err);
  }
};

/**
 * POST /api/like
 * Body: { likee_id: <id>, status: 'like' | 'unlike', details?: <any> }
 * req.user.id is populated by auth middleware.
 */
exports.toggleLike = async (req, res) => {
  try {
    const likerId = req.user.id;
    const { likee_id, status, details } = req.body;

    // Basic validation
    if (!likee_id || !['like', 'unlike'].includes(status)) {
      return res.status(400).json({ message: 'Invalid request payload' });
    }

    // Upsert like record
    await db.query(
      `INSERT INTO user_likes (liker_id, likee_id, status, details)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         details = VALUES(details),
         updated_at = NOW()`,
      [likerId, likee_id, status, details ? JSON.stringify(details) : null]
    );

    // Retrieve target user's FCM token
    const [userRows] = await db.query('SELECT fcm_token FROM users WHERE id = ?', [likee_id]);
    const fcmToken = userRows[0] ? userRows[0].fcm_token : null;

    // Send notifications if it's a like
    if (status === 'like') {
      // Socket.io notification (in‑app)
      emitSocketNotification(likee_id, {
        type: 'like',
        from: likerId,
        message: `User ${likerId} liked you!`,
      });

      // FCM push notification
      const title = 'New Like!';
      const body = `User ${likerId} liked your profile.`;
      await sendFcm(fcmToken, title, body);
    }

    return res.status(200).json({
      message: `Successfully recorded ${status}`,
      like: { liker_id: likerId, likee_id, status, details },
    });
  } catch (err) {
    console.error('LIKE API ERROR:', err);
    return res.status(500).json({ message: 'Unable to process like', error: err.message });
  }
};

// GET /api/likes - list users liked by current user
exports.getLikedUsers = async (req, res) => {
  try {
    const likerId = req.user.id;
    // fetch liked user ids
    const [likeRows] = await db.query('SELECT likee_id FROM user_likes WHERE liker_id = ? AND status = ?', [likerId, "like"]);
    const likeeIds = likeRows.map(r => r.likee_id);
    if (likeeIds.length === 0) {
      return res.status(200).json({ likedUsers: [] });
    }
    // fetch user details
    const placeholders = likeeIds.map(() => '?').join(',');
    const [users] = await db.query(`SELECT * FROM users WHERE id IN (${placeholders})`, likeeIds);
    // fetch photos for these users
    const [photoRows] = await db.query(`SELECT user_id, id, url FROM user_photos WHERE user_id IN (${placeholders}) ORDER BY is_required DESC, id ASC`, likeeIds);
    const photosByUser = {};
    photoRows.forEach(p => {
      if (!photosByUser[p.user_id]) photosByUser[p.user_id] = [];
      photosByUser[p.user_id].push({ id: p.id, url: toFullUrl(p.url) });
    });
    const likedProfiles = users.map(u => {
      const profile = buildUserPayload(u);
      profile.photos = photosByUser[u.id] || [];
      return profile;
    });
    return res.status(200).json({ likedUsers: likedProfiles });
  } catch (err) {
    console.error('GET LIKED USERS ERROR:', err);
    return res.status(500).json({ message: 'Unable to fetch liked users', error: err.message });
  }
};
