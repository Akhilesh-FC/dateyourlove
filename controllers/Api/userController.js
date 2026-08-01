const https = require('https');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { calculateAge, toFullUrl } = require('../../utils/appHelpers');

const MOBILE_REGEX = /^[0-9]{10}$/;
const otpStore = new Map();
const getJwtSecret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-me');

// ---------- helpers ----------

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  // Agar column JSON type ka hai to mysql2 pehle se hi array/object de deta hai
  // (server par yahi ho raha tha) - aise me JSON.parse crash kar deta hai.
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

// Poora users row -> API response shape. Sabhi columns (purane + naye) yahan
// se aate hain, taaki har jagah (login, register, get-profile, update-profile)
// same consistent object mile.
const buildUserPayload = (row) => ({
  id: row.id,
  mobile: row.mobile,
  email: row.email,
  first_name: row.first_name,
  about: row.about,
  dob: row.dob,
  age: calculateAge(row.dob),
  gender: row.gender,
  pronouns: row.pronouns,
  interested_in: safeParseJson(row.interested_in, []),
  height_cm: row.height_cm,
  looking_for: row.looking_for,
  relationship_type: row.relationship_type,
  open_to: safeParseJson(row.open_to, []),
  more_about: row.more_about,
  religion: row.religion,
  zodiac: row.zodiac,
  education: row.education,
  family_plan: row.family_plan,
  communication_style: row.communication_style,
  love_style: row.love_style,
  pets: row.pets,
  prompt: row.prompt,
  job: row.job,
  interests: safeParseJson(row.interests, []),
  languages: safeParseJson(row.languages, []),
  lifestyle_smoking: row.lifestyle_smoking,
  lifestyle_drinking: row.lifestyle_drinking,
  lifestyle_workout: row.lifestyle_workout,
  diet: row.diet,
  lat: row.lat,
  lng: row.lng,
  distance_preferred: row.distance_preferred,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const isMockOtpEnabled = () => process.env.OTP_MOCK === 'true' || process.env.NODE_ENV !== 'production';

const generateOtpCode = () => String(Math.floor(1000 + Math.random() * 9000));

const saveMockOtp = (mobile, otp) => {
  otpStore.set(String(mobile), {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
};

const getMockOtp = (mobile) => {
  const entry = otpStore.get(String(mobile));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(String(mobile));
    return null;
  }
  return entry;
};

const requestOtpProvider = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { rejectUnauthorized: false }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      raw += chunk;
    });
    res.on('end', () => {
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (err) {
        data = raw;
      }

      resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        raw,
        data,
      });
    });
  });

  req.on('error', reject);
});

// ---------- 1) SEND OTP ----------

exports.sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile || !MOBILE_REGEX.test(String(mobile))) {
      return res.status(400).json({ message: 'Valid mobile number required' });
    }

    const merchantKey = process.env.API_MERCHANT_KEY;
    if (!merchantKey && !isMockOtpEnabled()) {
      throw new Error('API_MERCHANT_KEY not configured');
    }

    if (isMockOtpEnabled()) {
      const otp = generateOtpCode();
      saveMockOtp(mobile, otp);
      console.log(`Mock OTP for ${mobile}: ${otp}`);
      return res.status(200).json({
        message: 'OTP sent successfully (mock mode)',
        otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
      });
    }

    const url = `https://indopay.cloud/otp/newsend_otp.php?merchant_key=${merchantKey}&mobile_no=${mobile}&digit=4`;
    const response = await requestOtpProvider(url);
    if (!response.ok) {
      throw new Error(`OTP provider returned status ${response.status}: ${response.raw || 'No response body'}`);
    }

    return res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('SEND OTP ERROR:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ---------- 2) DEDICATED REGISTER ENDPOINT (multipart/form-data) ----------
// Text fields aate hain req.body me (strings).
// Images aati hain req.files me (multer 'photos' field se, upload.array('photos', 6)).
// interested_in / languages ko form-data me array ki tarah bhejna ho to:
//   - same key "interested_in" ko 2-3 baar add karo (Postman form-data me),
//   - YA ek hi field me comma-separated string bhejo: "male,female"
//   - YA ek hi field me JSON string bhejo: '["male","female"]'
// teeno tareeke yahan handle ho jate hain.

const parseArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [trimmed];
      } catch (err) {
        // fall through to comma split
      }
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [value];
};

exports.registerUser = async (req, res) => {
  try {
    const {
      mobile,
      email,
      first_name,
      about,
      dob,
      gender,
      interested_in,
      height_cm,
      looking_for,
      more_about,
      religion,
      languages,
      lifestyle_smoking,
      lifestyle_drinking,
      lifestyle_workout,
      diet,
      lat,
      lng,
      distance_preferred,
      fcm_token,
    } = req.body;

    const uploadedFiles = req.files || [];

    if (!mobile || !MOBILE_REGEX.test(String(mobile))) {
      return res.status(400).json({ message: 'Valid mobile number required' });
    }

    const missingFields = [];
    if (!email) missingFields.push('email');
    if (!first_name) missingFields.push('first_name');
    if (!dob) missingFields.push('dob');
    if (!gender) missingFields.push('gender');
    if (!interested_in) missingFields.push('interested_in');
    if (!height_cm) missingFields.push('height_cm');
    if (!looking_for) missingFields.push('looking_for');
    if (!fcm_token) missingFields.push('fcm_token');

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields',
        requiredFields: missingFields,
      });
    }

    if (uploadedFiles.length < 4) {
      return res.status(400).json({ message: 'Upload at least 4 photos' });
    }

    const [existingUser] = await db.query('SELECT id FROM users WHERE mobile = ? OR email = ?', [mobile, email]);
    if (existingUser.length) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const parsedInterestedIn = parseArrayField(interested_in);
    const parsedLanguages = parseArrayField(languages);
    const photos = uploadedFiles.map((file) => `/uploads/photos/${file.filename}`);

    const [result] = await db.query(
      `INSERT INTO users (
        mobile, email, first_name, about, dob, gender, interested_in,
        height_cm, looking_for, more_about, religion, languages,
        lifestyle_smoking, lifestyle_drinking, lifestyle_workout, diet,
        lat, lng, distance_preferred, fcm_token, is_otp_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        mobile,
        email,
        first_name,
        about || null,
        dob,
        gender,
        JSON.stringify(parsedInterestedIn),
        height_cm,
        looking_for,
        more_about || null,
        religion || null,
        JSON.stringify(parsedLanguages),
        lifestyle_smoking || null,
        lifestyle_drinking || null,
        lifestyle_workout || null,
        diet || null,
        lat || null,
        lng || null,
        distance_preferred || null,
        fcm_token,
      ]
    );

    const newUserId = result.insertId;

    if (photos && Array.isArray(photos)) {
      const photoQueries = photos.map((url, index) => [newUserId, url, index < 4 ? 1 : 0]);
      await Promise.all(
        photoQueries.map((params) =>
          db.query('INSERT INTO user_photos (user_id, url, is_required, created_at) VALUES (?, ?, ?, NOW())', params)
        )
      );
    }

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ message: 'JWT secret not configured' });
    }

    const token = jwt.sign({ id: newUserId, mobile }, jwtSecret, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      userId: newUserId,
      isRegistered: true,
      photos: photos.map((url) => toFullUrl(url)),
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err.message);
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

// ---------- 4) GET PROFILE (protected - needs Authorization: Bearer <token>) ----------
// Token authMiddleware se verify hokar req.user = { id, mobile } set karta hai.
// Yahan sirf token ke userId ki profile milegi - koi userId body/query me
// bhejne ki zarurat nahi (aur bhej bhi de to use nahi kiya jayega).

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [photoRows] = await db.query(
      'SELECT id, url FROM user_photos WHERE user_id = ? ORDER BY is_required DESC, id ASC',
      [userId]
    );

    const profile = buildUserPayload(rows[0]);
    profile.photos = photoRows.map((p) => ({ id: p.id, url: toFullUrl(p.url) }));

    return res.status(200).json({ user: profile });
  } catch (err) {
    console.error('GET PROFILE ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch profile' });
  }
};

// ---------- 5) UPDATE PROFILE (protected - needs Authorization: Bearer <token>) ----------
// PATCH, multipart/form-data. Sirf jo fields bheje jayein wahi update honge
// (partial update) - jo nahi bheja wo waisa hi rahega jaisa DB me hai.
//
// Naye files "photos_add" field se aate hain (multer -> req.files).
// Photos hatane ke liye "photos_remove" me comma-separated photo IDs bhejo, jaise "12,15".
// "prompts" JSON string ke roop me bhejo: '[{"prompt":"...","answer":"..."}]'
// "open_to" comma-separated ya JSON array string, dono chalega (parseArrayField wahi use karta hai).

const UPDATABLE_TEXT_FIELDS = [
  'first_name', 'about', 'more_about', 'dob', 'gender', 'height_cm', 'looking_for',
  'religion', 'lifestyle_smoking', 'lifestyle_drinking', 'lifestyle_workout', 'diet',
  'lat', 'lng', 'distance_preferred',
  'pronouns', 'relationship_type', 'zodiac', 'education', 'family_plan',
  'communication_style', 'love_style', 'pets',
];

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body;
    const uploadedFiles = req.files || [];

    const [existingRows] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!existingRows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ---- Simple text/number fields: update only the ones actually sent ----
    const setClauses = [];
    const values = [];
    UPDATABLE_TEXT_FIELDS.forEach((field) => {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(body[field] === '' ? null : body[field]);
      }
    });

    // ---- Array fields (JSON columns) ----
    if (body.interested_in !== undefined) {
      setClauses.push('interested_in = ?');
      values.push(JSON.stringify(parseArrayField(body.interested_in)));
    }
    if (body.languages !== undefined) {
      setClauses.push('languages = ?');
      values.push(JSON.stringify(parseArrayField(body.languages)));
    }
    if (body.open_to !== undefined) {
      setClauses.push('open_to = ?');
      values.push(JSON.stringify(parseArrayField(body.open_to)));
    }

    // ---- Prompts (store raw value) ----
    if (body.prompts !== undefined) {
      // Directly store the provided value (string/number) in the `prompt` column
      setClauses.push('prompt = ?');
      values.push(body.prompts);
    }
    
    // Ensure UPDATE runs; log details for debugging
    if (setClauses.length > 0) {
      console.log('UpdateProfile setClauses:', setClauses);
      console.log('UpdateProfile values:', values);
      setClauses.push('updated_at = NOW()');
      await db.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, [...values, userId]);
    } else {
      console.log('No fields to update, only updating timestamp');
      await db.query('UPDATE users SET updated_at = NOW() WHERE id = ?', [userId]);
    }

    // ---- Remove photos ----
    if (body.photos_remove) {
      const idsToRemove = String(body.photos_remove)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (idsToRemove.length) {
        const placeholders = idsToRemove.map(() => '?').join(',');
        await db.query(
          `DELETE FROM user_photos WHERE user_id = ? AND id IN (${placeholders})`,
          [userId, ...idsToRemove]
        );
      }
    }

    // ---- Add new photos ----
    if (uploadedFiles.length > 0) {
      const [existingPhotoCountRows] = await db.query('SELECT COUNT(*) AS count FROM user_photos WHERE user_id = ?', [userId]);
      const existingCount = existingPhotoCountRows[0].count;
      const photoQueries = uploadedFiles.map((file, index) => [
        userId,
        `/uploads/photos/${file.filename}`,
        existingCount + index < 4 ? 1 : 0,
      ]);
      await Promise.all(
        photoQueries.map((params) =>
          db.query('INSERT INTO user_photos (user_id, url, is_required, created_at) VALUES (?, ?, ?, NOW())', params)
        )
      );
    }

    // ---- Return the fresh, complete profile ----
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const [photoRows] = await db.query(
      'SELECT id, url FROM user_photos WHERE user_id = ? ORDER BY is_required DESC, id ASC',
      [userId]
    );


    const profile = buildUserPayload(rows[0]);
    profile.open_to = safeParseJson(rows[0].open_to, []);
    profile.pronouns = rows[0].pronouns;
    profile.relationship_type = rows[0].relationship_type;
    profile.zodiac = rows[0].zodiac;
    profile.education = rows[0].education;
    profile.family_plan = rows[0].family_plan;
    profile.communication_style = rows[0].communication_style;
    profile.love_style = rows[0].love_style;
    profile.pets = rows[0].pets;
    profile.photos = photoRows.map((p) => ({ id: p.id, url: toFullUrl(p.url) }));


    return res.status(200).json({
      message: 'Profile updated successfully',
      user: profile,
    });
  } catch (err) {
    console.error('UPDATE PROFILE ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to update profile', error: err.message });
  }
};

// mobile + otp -> OTP provider se verify hota hai.
//   - mobile already DB me hai -> LOGIN (baaki fields ignore, agar bheje bhi ho)
//   - mobile DB me nahi hai -> isi request ke profile fields se REGISTER
//     (agar required fields missing hain to 400 with missingFields list)

exports.verifyOtp = async (req, res) => {
  try {
    const {
      mobile,
      otp,
      email,
      first_name,
      about,
      dob,
      gender,
      interested_in,
      height_cm,
      looking_for,
      more_about,
      religion,
      languages,
      lifestyle_smoking,
      lifestyle_drinking,
      lifestyle_workout,
      diet,
      lat,
      lng,
      distance_preferred,
      photos,
      fcm_token,
    } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ message: 'Mobile & OTP required' });
    }
    if (!MOBILE_REGEX.test(String(mobile))) {
      return res.status(400).json({ message: 'Invalid mobile number' });
    }

    const merchantKey = process.env.API_MERCHANT_KEY;
    if (!merchantKey && !isMockOtpEnabled()) {
      throw new Error('API_MERCHANT_KEY not configured');
    }

    if (isMockOtpEnabled()) {
      const storedOtp = getMockOtp(mobile);
      if (storedOtp && String(storedOtp.otp) === String(otp)) {
        otpStore.delete(String(mobile));
      } else {
        return res.status(400).json({ message: 'Invalid OTP' });
      }
    } else {
      const verifyUrl = `https://indopay.cloud/otp/verifyotp.php?merchant_key=${merchantKey}&mobile=${mobile}&otp=${otp}`;
      const response = await requestOtpProvider(verifyUrl);

      if (!response.ok) {
        throw new Error(`OTP provider returned status ${response.status}: ${response.raw || 'No response body'}`);
      }

      const data = response.data;

      const otpSuccess =
        data?.status == 'success' ||
        data?.status == 'true' ||
        data?.success == true ||
        data?.error == '200' ||
        (typeof data?.msg === 'string' && data.msg.includes('Successfully'));

      if (!otpSuccess) {
        return res.status(400).json({ message: 'Invalid OTP', raw: data });
      }
    }

    const [rows] = await db.query('SELECT * FROM users WHERE mobile = ?', [mobile]);

    // ---------- MOBILE MATCHED -> LOGIN ----------
    if (rows.length > 0) {
      const user = rows[0];
      const jwtSecret = getJwtSecret();
      if (!jwtSecret) {
        return res.status(500).json({ message: 'JWT secret not configured' });
      }
      const token = jwt.sign({ id: user.id, mobile }, jwtSecret, { expiresIn: '7d' });
      // Update FCM token if provided in request
      await db.query('UPDATE users SET fcm_token = ? WHERE id = ?', [fcm_token || null, user.id]);

      const [photoRows] = await db.query(
        'SELECT id, url FROM user_photos WHERE user_id = ? ORDER BY is_required DESC, id ASC',
        [user.id]
      );
      const profile = buildUserPayload(user);
      profile.photos = photoRows.map((p) => ({ id: p.id, url: toFullUrl(p.url) }));

      return res.status(200).json({
        message: 'Login successful',
        token,
        userId: user.id,
        isRegistered: true,
        user: profile,
      });
    }

    // ---------- MOBILE NOT FOUND -> REGISTER with this request's payload ----------
    const missingFields = [];
    if (!email) missingFields.push('email');
    if (!first_name) missingFields.push('first_name');
    if (!dob) missingFields.push('dob');
    if (!gender) missingFields.push('gender');
    if (!interested_in) missingFields.push('interested_in');
    if (!height_cm) missingFields.push('height_cm');
    if (!looking_for) missingFields.push('looking_for');

    if (missingFields.length > 0) {
      return res.status(200).json({
        message: 'User not found',
        action: 'register',
        isRegistered: false,
        requiredFields: missingFields,
      });
    }

    if (photos && (!Array.isArray(photos) || photos.length < 4)) {
      return res.status(400).json({ message: 'Photos must be at least 4 items' });
    }

    const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const parsedInterestedIn = Array.isArray(interested_in) ? interested_in : [interested_in];
    const parsedLanguages = Array.isArray(languages) ? languages : languages ? [languages] : [];

    const [result] = await db.query(
      `INSERT INTO users (
        mobile, email, first_name, about, dob, gender, interested_in,
        height_cm, looking_for, more_about, religion, languages,
        lifestyle_smoking, lifestyle_drinking, lifestyle_workout, diet,
        lat, lng, distance_preferred, fcm_token, is_otp_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        mobile,
        email,
        first_name,
        about || null,
        dob,
        gender,
        JSON.stringify(parsedInterestedIn),
        height_cm,
        looking_for,
        more_about || null,
        religion || null,
        JSON.stringify(parsedLanguages),
        lifestyle_smoking || null,
        lifestyle_drinking || null,
        lifestyle_workout || null,
        diet || null,
        lat || null,
        lng || null,
        distance_preferred || null,
        fcm_token || null,
      ]
    );

    const newUserId = result.insertId;

    if (photos && Array.isArray(photos)) {
      const photoQueries = photos.map((url, index) => [newUserId, url, index < 4 ? 1 : 0]);
      await Promise.all(
        photoQueries.map((params) =>
          db.query('INSERT INTO user_photos (user_id, url, is_required, created_at) VALUES (?, ?, ?, NOW())', params)
        )
      );
    }

    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ message: 'JWT secret not configured' });
    }
    const token = jwt.sign({ id: newUserId, mobile }, jwtSecret, { expiresIn: '7d' });

    return res.status(200).json({
      message: 'Registration successful',
      token,
      userId: newUserId,
      isRegistered: true,
      photos: (photos || []).map((url) => toFullUrl(url)),
    });
  } catch (err) {
    console.error('VERIFY OTP ERROR:', err.message);
    return res.status(500).json({ message: 'OTP verification failed', error: err.message });
  }
};