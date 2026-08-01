const db = require('../../config/db');
const { messaging } = require('../../config/firebase'); // Firebase Admin messaging
const { getIo } = require('../../config/socket'); // socket.io getter

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
const sendFcm = async (fcmToken, title, body) => {
  if (!fcmToken) return; // no token → nothing to send
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
  };
  try {
    await messaging.send(message);
    console.log('✅ FCM sent to token', fcmToken);
  } catch (err) {
    console.error('❌ FCM error:', err);
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
