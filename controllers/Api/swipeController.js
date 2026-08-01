const db = require('../../config/db');
const { calculateAge, toFullUrl } = require('../../utils/appHelpers');

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

const DEFAULT_RADIUS_KM = 50; // agar user ne distance_preferred set hi nahi kiya to

// ---------- helpers to shape data exactly like Flutter's SwipeProfile ----------

const formatHeightLabel = (heightCm) => {
  if (!heightCm) return '';
  const totalInches = Math.round(heightCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches > 0 ? `${feet}ft ${inches}in height` : `${feet}ft height`;
};

const formatDistanceLabel = (distanceKm) => {
  if (distanceKm === null || distanceKm === undefined) return '';
  if (distanceKm < 1) return 'Less than 1 km away';
  return `${Math.round(distanceKm)} km away`;
};

// ---------- GET /api/swipe/feed (protected - Authorization: Bearer <token>) ----------
// Response shape matches the Flutter SwipeProfile model exactly, so this can
// be dropped straight into swipeProvider._fetchNearbyProfiles() in place of
// mockProfiles, with zero UI changes.

exports.getSwipeFeed = async (req, res) => {
  try {
    const userId = req.user.id;

    const [meRows] = await db.query(
      'SELECT lat, lng, distance_preferred FROM users WHERE id = ?',
      [userId]
    );
    if (!meRows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const me = meRows[0];
    if (me.lat === null || me.lat === undefined || me.lng === null || me.lng === undefined) {
      return res.status(400).json({ message: 'Set your location (lat/lng) first before swiping' });
    }

    const radiusKm = me.distance_preferred || DEFAULT_RADIUS_KM;

    // Haversine formula + a LEFT JOIN against `swipes` to know if this
    // person already liked/superliked me (-> likesYou), and excludes anyone
    // I've already swiped on (like/pass/superlike) so the same profile
    // doesn't show up again.
    const [rows] = await db.query(
      `SELECT
         u.*,
         (6371 * acos(
            cos(radians(?)) * cos(radians(u.lat)) * cos(radians(u.lng) - radians(?)) +
            sin(radians(?)) * sin(radians(u.lat))
         )) AS distance_km,
         EXISTS(
           SELECT 1 FROM swipes s
           WHERE s.user_id = u.id AND s.target_user_id = ?
             AND s.action IN ('like', 'superlike')
         ) AS likes_you
       FROM users u
       WHERE u.id != ?
         AND u.is_otp_verified = 1
         AND u.lat IS NOT NULL
         AND u.lng IS NOT NULL
         AND u.id NOT IN (
           SELECT target_user_id FROM swipes WHERE user_id = ?
         )
         AND u.gender = (CASE WHEN ? = 'female' THEN 'male' ELSE 'female' END)
         AND JSON_CONTAINS(u.interested_in, ?, '$')
       HAVING distance_km <= ?
       ORDER BY distance_km ASC`,
      [me.lat, me.lng, me.lat, userId, userId, userId, me.gender || 'female', JSON.stringify(me.interested_in || []), radiusKm]
    );

    // Photos for all users in one query (avoids N+1)
    let photosByUser = {};
    if (rows.length) {
      const userIds = rows.map((u) => u.id);
      const placeholders = userIds.map(() => '?').join(',');
      const [photoRows] = await db.query(
        `SELECT user_id, url FROM user_photos WHERE user_id IN (${placeholders}) ORDER BY is_required DESC, id ASC`,
        userIds
      );
      photoRows.forEach((p) => {
        if (!photosByUser[p.user_id]) photosByUser[p.user_id] = [];
        photosByUser[p.user_id].push(p.url);
      });
    }

    const users = rows.map((row) => {
      const photos = (photosByUser[row.id] || []).map((url) => toFullUrl(url));
      return {
        // ---- Flutter SwipeProfile model fields (unchanged from before) ----
        id: String(row.id),
        name: row.first_name || '',
        age: calculateAge(row.dob),
        distance: formatDistanceLabel(row.distance_km),
        bio: row.about || '',
        imageUrl: photos[0] || '',
        tag: 'Nearby',
        relationshipGoal: row.looking_for || '',
        job: row.job || '',
        heightLabel: formatHeightLabel(row.height_cm),
        likesYou: !!row.likes_you,
        photoCount: photos.length,
        education: row.education || '',
        communicationStyle: row.communication_style || '',
        loveStyle: row.love_style || '',
        zodiac: row.zodiac || '',
        smokingHabit: row.lifestyle_smoking || '',
        drinkingHabit: row.lifestyle_drinking || '',
        interests: safeParseJson(row.interests, []),

        // ---- Baaki sabhi users-related data (koi field miss na ho) ----
        gender: row.gender,
        pronouns: row.pronouns,
        interested_in: safeParseJson(row.interested_in, []),
        height_cm: row.height_cm,
        relationship_type: row.relationship_type,
        open_to: safeParseJson(row.open_to, []),
        more_about: row.more_about,
        religion: row.religion,
        family_plan: row.family_plan,
        pets: row.pets,
        prompt: row.prompt,
        languages: safeParseJson(row.languages, []),
        lifestyle_workout: row.lifestyle_workout,
        diet: row.diet,
        distance_preferred: row.distance_preferred,
        photos,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return res.status(200).json({
      radiusKm,
      count: users.length,
      users,
    });
  } catch (err) {
    console.error('SWIPE FEED ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch swipe feed' });
  }
};

// ---------- POST /api/swipe/action (protected) ----------
// Body: { targetUserId, action } where action is 'like' | 'pass' | 'superlike'
// Records the swipe and tells the caller if it created a mutual match.

exports.recordSwipeAction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId, action } = req.body;

    if (!targetUserId || !['like', 'pass', 'superlike'].includes(action)) {
      return res.status(400).json({ message: "targetUserId and action ('like'|'pass'|'superlike') are required" });
    }
    if (Number(targetUserId) === Number(userId)) {
      return res.status(400).json({ message: 'Cannot swipe on your own profile' });
    }

    await db.query(
      `INSERT INTO swipes (user_id, target_user_id, action)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE action = VALUES(action), created_at = NOW()`,
      [userId, targetUserId, action]
    );

    let matched = false;
    if (action === 'like' || action === 'superlike') {
      const [mutual] = await db.query(
        `SELECT id FROM swipes WHERE user_id = ? AND target_user_id = ? AND action IN ('like','superlike')`,
        [targetUserId, userId]
      );
      matched = mutual.length > 0;
    }

    return res.status(200).json({ message: 'Swipe recorded', matched });
  } catch (err) {
    console.error('SWIPE ACTION ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to record swipe' });
  }
};