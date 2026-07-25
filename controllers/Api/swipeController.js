const db = require('../../config/db');

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

// ---------- GET /api/swipe/feed (protected - Authorization: Bearer <token>) ----------
// Token se apna userId milta hai -> usi user ka lat/lng/distance_preferred
// DB se nikal ke, usi radius ke andar ke saare active (OTP-verified) users
// (khud ko chhod ke) return karta hai, nearest-first.

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

    // Haversine formula - MySQL me radius-based distance nikalne ka standard tareeka.
    const [rows] = await db.query(
      `SELECT
         id, first_name, about, dob, gender, interested_in, height_cm,
         looking_for, more_about, religion, languages,
         lifestyle_smoking, lifestyle_drinking, lifestyle_workout, diet,
         lat, lng,
         (6371 * acos(
            cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
            sin(radians(?)) * sin(radians(lat))
         )) AS distance_km
       FROM users
       WHERE id != ?
         AND is_otp_verified = 1
         AND lat IS NOT NULL
         AND lng IS NOT NULL
       HAVING distance_km <= ?
       ORDER BY distance_km ASC`,
      [me.lat, me.lng, me.lat, userId, radiusKm]
    );

    // Sabhi users ke photos ek hi query me le aate hain (N+1 se bachne ke liye)
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

    const users = rows.map((row) => ({
      id: row.id,
      first_name: row.first_name,
      about: row.about,
      dob: row.dob,
      gender: row.gender,
      interested_in: safeParseJson(row.interested_in, []),
      height_cm: row.height_cm,
      looking_for: row.looking_for,
      more_about: row.more_about,
      religion: row.religion,
      languages: safeParseJson(row.languages, []),
      lifestyle_smoking: row.lifestyle_smoking,
      lifestyle_drinking: row.lifestyle_drinking,
      lifestyle_workout: row.lifestyle_workout,
      diet: row.diet,
      distance_km: Math.round(row.distance_km * 10) / 10,
      photos: photosByUser[row.id] || [],
    }));

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