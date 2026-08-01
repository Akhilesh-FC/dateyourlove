const express = require('express');
const router = express.Router();

// Controllers
const settingsController = require('../../controllers/Api/settingsController');

// Settings (public GET/POST)
router.get('/setting', settingsController.getSettings);
router.post('/setting', settingsController.upsertSetting);

module.exports = router;
