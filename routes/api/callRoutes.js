const express = require('express');
const router = express.Router();
const callController = require('../../controllers/Api/callController');
const authMiddleware = require('../../middleware/authMiddleware');

router.post('/request', authMiddleware, callController.requestCall);
router.post('/respond', authMiddleware, callController.respondCall);
router.post('/end', authMiddleware, callController.endCall);

module.exports = router;
