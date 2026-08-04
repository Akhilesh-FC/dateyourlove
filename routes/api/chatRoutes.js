const express = require('express');
const router = express.Router();

const chatController = require('../../controllers/Api/chatController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/rooms', authMiddleware, chatController.getChatRooms);
router.get('/messages/:roomId', authMiddleware, chatController.getChatMessages);
router.post('/send', authMiddleware, chatController.sendMessage);
router.patch('/delivered/:messageId', authMiddleware, chatController.markMessageDelivered);
router.patch('/seen/:messageId', authMiddleware, chatController.markMessageSeen);

module.exports = router;
