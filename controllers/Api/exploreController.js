const db = require('../../config/db');
const { buildUserPayload } = require('../../controllers/Api/userController');
const { toFullUrl } = require('../../utils/appHelpers');

const normalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((item) => String(item));
      }
    } catch (err) {
      // ignore and treat as plain string
    }

    return [trimmed];
  }

  return [];
};

const valuesMatch = (selectedValue, targetValue) => {
  const selectedValues = normalizeValue(selectedValue);
  const targetValues = normalizeValue(targetValue);

  if (!selectedValues.length || !targetValues.length) {
    return false;
  }

  return selectedValues.some((value) => targetValues.includes(value));
};

const parseLimit = (value, fallback = 20) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(100, Math.floor(parsed));
};

const parseOffset = (value, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const buildExploreResponse = async (currentUserId, selectedFilters, limit, offset = 0) => {
  const [meRows] = await db.query(
    `SELECT * FROM users WHERE id = ? LIMIT 1`,
    [currentUserId]
  );

  if (!meRows.length) {
    return { error: 'User not found' };
  }

  const me = meRows[0];
  const [rows] = await db.query(
    `SELECT * FROM users
     WHERE id != ?
       AND is_otp_verified = 1
       AND id NOT IN (
         SELECT likee_id FROM user_likes WHERE liker_id = ?
       )
       AND id NOT IN (
         SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
       )
       AND id NOT IN (
         SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
       )
     ORDER BY created_at DESC`,
    [currentUserId, currentUserId, currentUserId, currentUserId]
  );

  const filterMap = {
    looking_for: 'looking_for',
    relationship_type: 'relationship_type',
    religion: 'religion',
    languages: 'languages',
    interests: 'interests',
    lifestyle_smoking: 'lifestyle_smoking',
    lifestyle_drinking: 'lifestyle_drinking',
    lifestyle_workout: 'lifestyle_workout',
    diet: 'diet',
    zodiac: 'zodiac',
    education: 'education',
    family_plan: 'family_plan',
    communication_style: 'communication_style',
    love_style: 'love_style',
    pets: 'pets',
    open_to: 'open_to',
  };

  const selectedFiltersNormalized = Object.entries(selectedFilters || {}).reduce((acc, [key, value]) => {
    const normalizedValues = normalizeValue(value);
    if (normalizedValues.length) {
      acc[key] = normalizedValues;
    }
    return acc;
  }, {});

  const matchedProfiles = [];

  for (const row of rows) {
    const matchedFields = [];

    if (me.interested_in) {
      const selectedGenderValues = normalizeValue(me.interested_in);
      const targetGender = String(row.gender || '').toLowerCase();
      if (selectedGenderValues.length && targetGender && selectedGenderValues.includes(targetGender)) {
        matchedFields.push('interested_in');
      }
    }

    for (const [fieldName, fieldValues] of Object.entries(selectedFiltersNormalized)) {
      const dbField = filterMap[fieldName];
      if (!dbField) continue;

      const targetValue = row[dbField];
      if (valuesMatch(fieldValues, targetValue)) {
        matchedFields.push(fieldName);
      }
    }

    if (matchedFields.length) {
      matchedProfiles.push({
        user: row,
        matchedFields: [...new Set(matchedFields)],
        matchScore: matchedFields.length,
      });
    }
  }

  matchedProfiles.sort((a, b) => b.matchScore - a.matchScore);

  const selectedUsers = matchedProfiles.slice(offset, offset + limit);
  const userIds = selectedUsers.map((item) => item.user.id);

  let photosByUser = {};
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    const [photoRows] = await db.query(
      `SELECT user_id, id, url FROM user_photos WHERE user_id IN (${placeholders}) ORDER BY is_required DESC, id ASC`,
      userIds
    );

    photoRows.forEach((p) => {
      if (!photosByUser[p.user_id]) photosByUser[p.user_id] = [];
      photosByUser[p.user_id].push({ id: p.id, url: toFullUrl(p.url) });
    });
  }

  const users = selectedUsers.map((item) => {
    const profile = buildUserPayload(item.user);
    profile.photos = photosByUser[item.user.id] || [];
    profile.matchScore = item.matchScore;
    profile.matchedFields = item.matchedFields;
    return profile;
  });

  return {
    count: users.length,
    users,
  };
};

exports.exploreUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const limit = parseLimit(req.query.limit ?? req.body?.limit, 20);
    const offset = parseOffset(req.query.offset ?? req.body?.offset, 0);

    const response = await buildExploreResponse(currentUserId, req.body || {}, limit, offset);
    if (response.error) {
      return res.status(404).json({ message: response.error });
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('EXPLORE USERS ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch explore users' });
  }
};

exports.exploreUsersPost = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const limit = parseLimit(req.body?.limit, 20);
    const offset = parseOffset(req.body?.offset, 0);
    const filters = req.body?.filters || req.body || {};

    const response = await buildExploreResponse(currentUserId, filters, limit, offset);
    if (response.error) {
      return res.status(404).json({ message: response.error });
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('EXPLORE USERS POST ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch explore users' });
  }
};
