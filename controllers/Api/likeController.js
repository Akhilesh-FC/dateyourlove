const db = require('../../config/db');
const { messaging } = require('../../config/firebase'); // Firebase Admin messaging
const { getIo } = require('../../config/socket'); // socket.io getter
const { toFullUrl } = require('../../utils/appHelpers');
const { buildUserPayload } = require('../../controllers/Api/userController');
const { ensureChatRoomForUsers } = require('../../controllers/Api/chatController');

/** Helper – emit socket.io events for notification and compatibility */
const emitSocketEvents = (targetUserId, event, payload) => {
  const io = getIo();
  if (io) {
    io.to(`user_${targetUserId}`).emit(event, payload);
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
 * Body: { likee_id: <id>, action: 'like' | 'unlike' | 'superlike', details?: <any> }
 * Also accepts `status` for backward compatibility.
 * req.user.id is populated by auth middleware.
 */
const ALLOWED_LIKE_ACTIONS = new Set(['like', 'unlike', 'superlike']);
const DEFAULT_LIKE_LIMITS = { maxDailyLikes: 3, maxDailySuperlikes: 1 };

async function getFreeUserLikeLimits() {
  try {
    const [rows] = await db.query(
      `SELECT id, type, max_daily_likes AS maxDailyLikes, max_daily_superlikes AS maxDailySuperlikes
       FROM like_limits
       WHERE type = 'free_user'
       LIMIT 1`
    );
    if (rows.length) {
      return {
        maxDailyLikes: Number(rows[0].maxDailyLikes || DEFAULT_LIKE_LIMITS.maxDailyLikes),
        maxDailySuperlikes: Number(rows[0].maxDailySuperlikes || DEFAULT_LIKE_LIMITS.maxDailySuperlikes)
      };
    }
  } catch (err) {
    console.warn('LIKE LIMITS TABLE unavailable, using defaults:', err.message);
  }
  return DEFAULT_LIKE_LIMITS;
}

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

exports.toggleLike = async (req, res) => {
  try {
    const likerId = req.user.id;
    const { likee_id, action: rawAction, details } = req.body;
    const action = rawAction || req.body.status;

    if (!likee_id || !ALLOWED_LIKE_ACTIONS.has(action)) {
      return res.status(400).json({ message: 'Invalid request payload' });
    }

    const [existingRows] = await db.query(
      'SELECT status FROM user_likes WHERE liker_id = ? AND likee_id = ?',
      [likerId, likee_id]
    );
    const existingStatus = existingRows.length ? existingRows[0].status : null;

    const isSubscribed = await userHasActiveSubscription(likerId);
    let limitInfo = {
      isSubscribed,
      maxDailyLikes: DEFAULT_LIKE_LIMITS.maxDailyLikes,
      maxDailySuperlikes: DEFAULT_LIKE_LIMITS.maxDailySuperlikes,
      likesToday: 0,
      superlikesToday: 0,
      canLike: true,
      canSuperlike: true
    };

    if (!isSubscribed) {
      const limits = await getFreeUserLikeLimits();
      limitInfo.maxDailyLikes = limits.maxDailyLikes;
      limitInfo.maxDailySuperlikes = limits.maxDailySuperlikes;

      const [countRows] = await db.query(
        `SELECT
           SUM(status = 'like') AS likesToday,
           SUM(status = 'superlike') AS superlikesToday
         FROM user_likes
         WHERE liker_id = ?
           AND DATE(updated_at) = CURDATE()`,
        [likerId]
      );

      const currentLikes = Number(countRows[0]?.likesToday || 0);
      const currentSuperlikes = Number(countRows[0]?.superlikesToday || 0);
      let projectedLikes = currentLikes;
      let projectedSuperlikes = currentSuperlikes;

      if (existingStatus === 'like' && action !== 'like') projectedLikes -= 1;
      if (existingStatus === 'superlike' && action !== 'superlike') projectedSuperlikes -= 1;
      if (action === 'like' && existingStatus !== 'like') projectedLikes += 1;
      if (action === 'superlike' && existingStatus !== 'superlike') projectedSuperlikes += 1;

      limitInfo.likesToday = projectedLikes;
      limitInfo.superlikesToday = projectedSuperlikes;
      limitInfo.canLike = projectedLikes <= limits.maxDailyLikes;
      limitInfo.canSuperlike = projectedSuperlikes <= limits.maxDailySuperlikes;
      limitInfo.likesRemaining = Math.max(0, limits.maxDailyLikes - projectedLikes);
      limitInfo.superlikesRemaining = Math.max(0, limits.maxDailySuperlikes - projectedSuperlikes);

      if (action === 'like' && projectedLikes > limits.maxDailyLikes) {
        return res.status(403).json({
          message: 'Daily like limit reached. Subscribe to continue liking profiles.',
          limitInfo: {
            ...limitInfo,
            likesToday: currentLikes,
            maxDailyLikes: limits.maxDailyLikes,
            canLike: false,
            likesRemaining: 0
          },
          code: 'LIKE_LIMIT_REACHED'
        });
      }

      if (action === 'superlike' && projectedSuperlikes > limits.maxDailySuperlikes) {
        return res.status(403).json({
          message: 'Daily superlike limit reached. Subscribe to continue liking profiles.',
          limitInfo: {
            ...limitInfo,
            superlikesToday: currentSuperlikes,
            maxDailySuperlikes: limits.maxDailySuperlikes,
            canSuperlike: false,
            superlikesRemaining: 0
          },
          code: 'SUPERLIKE_LIMIT_REACHED'
        });
      }
    }

    await db.query(
      `INSERT INTO user_likes (liker_id, likee_id, status, details)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         details = VALUES(details),
         updated_at = NOW()`,
      [likerId, likee_id, action, details ? JSON.stringify(details) : null]
    );

    let matched = false;
    if (action === 'like' || action === 'superlike') {
      const [targetUserRows] = await db.query('SELECT fcm_token FROM users WHERE id = ?', [likee_id]);
      const fcmToken = targetUserRows[0] ? targetUserRows[0].fcm_token : null;

      emitSocketEvents(likee_id, 'liked', {
        type: action,
        from: likerId,
        message: `User ${likerId} ${action === 'like' ? 'liked' : 'superliked'} you!`,
      });

      const title = action === 'like' ? 'New Like!' : 'New Superlike!';
      const bodyMessage = action === 'like'
        ? `User ${likerId} liked your profile.`
        : `User ${likerId} superliked your profile.`;
      await sendFcm(fcmToken, title, bodyMessage);

      const [mutualLikeRows] = await db.query(
        `SELECT status FROM user_likes
         WHERE liker_id = ? AND likee_id = ?
           AND status IN ('like','superlike')`,
        [likee_id, likerId]
      );

      const targetAlreadyLikedYou = mutualLikeRows.length > 0;
      const isNewPositiveAction = existingStatus !== 'like' && existingStatus !== 'superlike';

      if (targetAlreadyLikedYou && isNewPositiveAction) {
        matched = true;
        const [meRows] = await db.query('SELECT fcm_token FROM users WHERE id = ?', [likerId]);
        const myToken = meRows[0] ? meRows[0].fcm_token : null;
        const targetToken = fcmToken;

        const matchPayload = {
          type: 'match',
          users: [String(likerId), String(likee_id)],
          message: 'You have a new match!'
        };

        emitSocketEvents(likee_id, 'match', matchPayload);
        emitSocketEvents(likerId, 'match', matchPayload);

        await ensureChatRoomForUsers(likerId, likee_id);

        await Promise.all([
          sendFcm(targetToken, 'New Match!', 'You have a new match.'),
          sendFcm(myToken, 'New Match!', 'You have a new match.')
        ]);
      }
    }

    return res.status(200).json({
      message: `Successfully recorded ${action}`,
      matched,
      like: { liker_id: likerId, likee_id, status: action, details },
      limitInfo
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
    const isPlanActive = await userHasActiveSubscription(likerId);
    // fetch liked user ids
    const [likeRows] = await db.query('SELECT likee_id FROM user_likes WHERE liker_id = ? AND status = ?', [likerId, "like"]);
    const likeeIds = likeRows.map(r => r.likee_id);
    if (likeeIds.length === 0) {
      return res.status(200).json({ likedUsers: [], isPlanActive });
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
    return res.status(200).json({ likedUsers: likedProfiles, isPlanActive });
  } catch (err) {
    console.error('GET LIKED USERS ERROR:', err);
    return res.status(500).json({ message: 'Unable to fetch liked users', error: err.message });
  }
};

// GET /api/like/matches - list mutual matches based on likes/superlikes
exports.getMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      `SELECT u.*
       FROM users u
       JOIN user_likes ul1 ON ul1.likee_id = u.id
         AND ul1.liker_id = ?
         AND ul1.status IN ('like','superlike')
       JOIN user_likes ul2 ON ul2.likee_id = ?
         AND ul2.liker_id = u.id
         AND ul2.status IN ('like','superlike')
       WHERE u.id != ?`,
      [userId, userId, userId]
    );

    if (!rows.length) {
      return res.status(200).json({ count: 0, matches: [] });
    }

    const userIds = rows.map((row) => row.id);
    const placeholders = userIds.map(() => '?').join(',');
    const [photoRows] = await db.query(
      `SELECT user_id, id, url FROM user_photos WHERE user_id IN (${placeholders}) ORDER BY is_required DESC, id ASC`,
      userIds
    );

    const photosByUser = {};
    photoRows.forEach((p) => {
      if (!photosByUser[p.user_id]) photosByUser[p.user_id] = [];
      photosByUser[p.user_id].push({ id: p.id, url: toFullUrl(p.url) });
    });

    const matches = rows.map((row) => {
      const profile = buildUserPayload(row);
      profile.photos = photosByUser[row.id] || [];
      return profile;
    });

    return res.status(200).json({ count: matches.length, matches });
  } catch (err) {
    console.error('GET LIKE MATCHES ERROR:', err);
    return res.status(500).json({ message: 'Unable to fetch matches', error: err.message });
  }
};
