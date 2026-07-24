const express = require('express');
const router = express.Router();
const userController = require('../controllers/Api/userController');
const optionsController = require('../controllers/Api/optionsController');
const settingsController = require('../controllers/Api/settingsController');
const upload = require('../middleware/upload');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', (req, res) => res.json({ ok: true, version: 'api-v1' }));

// ---------- AUTH / REGISTRATION ----------
router.post('/otp/send', userController.sendOtp);
router.post('/otp/verify', userController.verifyOtp);
router.post('/register', upload.array('photos', 6), userController.registerUser);

// ---------- DROPDOWN / OPTIONS ----------
router.get('/options', optionsController.getAllOptions);
router.get('/options/looking-for', optionsController.getLookingForOptions);
router.get('/options/religions', optionsController.getReligionOptions);
router.get('/options/languages', optionsController.getLanguageOptions);
router.get('/options/smoking', optionsController.getSmokingOptions);
router.get('/options/drinking', optionsController.getDrinkingOptions);
router.get('/options/workout', optionsController.getWorkoutOptions);
router.get('/options/diet', optionsController.getDietOptions);

// ---------- SETTINGS (child policy, privacy, terms, refund - ek hi table/api) ----------
router.get('/setting', settingsController.getSettings);
router.post('/setting', settingsController.upsertSetting); // TODO: admin-auth se protect karo

// ---------- PROTECTED (token required) ----------
router.get('/profile/me', authMiddleware, userController.getProfile);

module.exports = router;