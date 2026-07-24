const express = require('express');
const router = express.Router();
const userController = require('../controllers/Api/userController');
const optionsController = require('../controllers/Api/optionsController');
const upload = require('../middleware/upload');

router.get('/', (req, res) => res.json({ ok: true, version: 'api-v1' }));

// ---------- AUTH / REGISTRATION ----------
router.post('/otp/send', userController.sendOtp);
router.post('/otp/verify', userController.verifyOtp); // JSON body, photos as URL array (optional)

// form-data: text fields + up to 6 files under the "photos" field
router.post('/register', upload.array('photos', 6), userController.registerUser);

// ---------- DROPDOWN / OPTIONS - har list ki apni alag api ----------
router.get('/options/looking-for', optionsController.getLookingForOptions);
router.get('/options/religions', optionsController.getReligionOptions);
router.get('/options/languages', optionsController.getLanguageOptions);
router.get('/options/smoking', optionsController.getSmokingOptions);
router.get('/options/drinking', optionsController.getDrinkingOptions);
router.get('/options/workout', optionsController.getWorkoutOptions);
router.get('/options/diet', optionsController.getDietOptions);

// ---------- PROTECTED (add here once you build them) ----------
// router.get('/profile/me', authMiddleware, userController.getMyProfile);
// router.post('/matches', authMiddleware, userController.getMatches);

module.exports = router;