// routes/api/subscriptionRoutes.js
const express = require('express');
const router = express.Router();

const subscriptionController = require('../../controllers/Api/subscriptionController');
const paytmWebhookController = require('../../controllers/Api/paytmWebhookController');
const authMiddleware = require('../../middleware/authMiddleware');

// Public endpoint to list plans
router.get('/plans', subscriptionController.listPlans);
router.get('/plans/:id', subscriptionController.getPlanDetail);

// Protected endpoint to initiate payment for a selected plan
router.post('/subscribe', authMiddleware, subscriptionController.initiatePayment);

// PayTM webhook (POST) – no auth needed, PayTM will call this URL
router.post('/paytm/webhook', paytmWebhookController.handle);
router.post('/subscription/paytm/webhook', paytmWebhookController.handle); // alias for env callback URL
router.post('/paytm/callback', paytmWebhookController.handle);
router.post('/v1/user/booking/paytm/callback', paytmWebhookController.handle); // legacy callback path alias

module.exports = router;
