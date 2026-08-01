const express = require('express');
const router = express.Router();

// Controllers
const userController = require('../../controllers/Api/userController');
const optionsController = require('../../controllers/Api/optionsController');
const settingsController = require('../../controllers/Api/settingsController');
const upload = require('../../middleware/upload');
const authMiddleware = require('../../middleware/authMiddleware');
const swipeController = require('../../controllers/Api/swipeController');

// Public routes
router.post('/otp/send', userController.sendOtp);
router.post('/otp/verify', userController.verifyOtp);
router.post('/register', upload.array('photos', 10), userController.registerUser);

// Options
router.get('/options', optionsController.getAllOptions);
router.get('/options/looking-for', optionsController.getLookingForOptions);
router.get('/options/religions', optionsController.getReligionOptions);
router.get('/options/languages', optionsController.getLanguageOptions);
router.get('/options/smoking', optionsController.getSmokingOptions);
router.get('/options/drinking', optionsController.getDrinkingOptions);
router.get('/options/workout', optionsController.getWorkoutOptions);
router.get('/options/diet', optionsController.getDietOptions);

// Settings (public GET/POST)
router.get('/setting', settingsController.getSettings);
router.post('/setting', settingsController.upsertSetting);

// Protected routes (require JWT)
router.get('/profile/me', authMiddleware, userController.getProfile);
router.get('/swipe/feed', authMiddleware, swipeController.getSwipeFeed);

module.exports = router;
