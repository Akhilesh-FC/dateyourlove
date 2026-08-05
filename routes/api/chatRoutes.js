const express = require('express');
const router = express.Router();

const chatController = require('../../controllers/Api/chatController');
const authMiddleware = require('../../middleware/authMiddleware');
const upload = require('../../middleware/upload');

router.get('/rooms', authMiddleware, chatController.getChatRooms);
router.get('/messages/:roomId', authMiddleware, chatController.getChatMessages);
router.post('/send', authMiddleware, chatController.sendMessage);
router.post('/upload-image', authMiddleware, upload.single('image'), chatController.uploadChatImage);
router.patch('/delivered/:messageId', authMiddleware, chatController.markMessageDelivered);
router.patch('/seen/:messageId', authMiddleware, chatController.markMessageSeen);

module.exports = router;
