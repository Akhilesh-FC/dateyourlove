const express = require('express');
const router = express.Router();
const userController = require('../controllers/Api/userController');
const OptionsController = require('../controllers/Api/OptionsController');
const upload = require('../middleware/upload');

router.get('/', (req, res) => res.json({ ok: true, version: 'api-v1' }));

// ---------- AUTH / REGISTRATION ----------
router.post('/otp/send', userController.sendOtp);
router.post('/otp/verify', userController.verifyOtp); // JSON body, photos as URL array (optional)

// form-data: text fields + up to 6 files under the "photos" field
router.post('/register', upload.array('photos', 6), userController.registerUser);

// ---------- DROPDOWN / OPTIONS - har list ki apni alag api ----------
router.get('/options/looking-for', OptionsController.getLookingForOptions);
router.get('/options/religions', OptionsController.getReligionOptions);
router.get('/options/languages', OptionsController.getLanguageOptions);
router.get('/options/smoking', OptionsController.getSmokingOptions);
router.get('/options/drinking', OptionsController.getDrinkingOptions);
router.get('/options/workout', OptionsController.getWorkoutOptions);
router.get('/options/diet', OptionsController.getDietOptions);

// ---------- PROTECTED (add here once you build them) ----------
// router.get('/profile/me', authMiddleware, userController.getMyProfile);
// router.post('/matches', authMiddleware, userController.getMatches);

module.exports = router;