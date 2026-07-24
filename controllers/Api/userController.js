const https = require('https');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');

const MOBILE_REGEX = /^[0-9]{10}$/;
const otpStore = new Map();
const getJwtSecret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-me');

// ---------- helpers ----------

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

const buildUserPayload = (row) => ({
  id: row.id,
  mobile: row.mobile,
  email: row.email,
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
  lat: row.lat,
  lng: row.lng,
  distance_preferred: row.distance_preferred,
  photos: safeParseJson(row.photos, []),
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

    if (uploadedFiles.length < 4 || uploadedFiles.length > 6) {
      return res.status(400).json({ message: 'Upload 4 to 6 photos' });
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
      photos,
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err.message);
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

// ---------- 3) VERIFY OTP + LOGIN / REGISTER (single call) ----------
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

      return res.status(200).json({
        message: 'Login successful',
        token,
        userId: user.id,
        isRegistered: true,
        user: buildUserPayload(user),
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

    if (photos && (!Array.isArray(photos) || photos.length < 4 || photos.length > 6)) {
      return res.status(400).json({ message: 'Photos must be an array of 4 to 6 items' });
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
    });
  } catch (err) {
    console.error('VERIFY OTP ERROR:', err.message);
    return res.status(500).json({ message: 'OTP verification failed', error: err.message });
  }
};