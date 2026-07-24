const express = require('express');
const router = express.Router();
const userController = require('../controllers/Api/userController');

router.get('/', (req, res) => res.json({ ok: true, version: 'api-v1' }));

// 1) mobile -> otp bhejta hai
router.post('/otp/send', userController.sendOtp);

// 2) mobile + otp (+ profile fields agar naya number hai)
//    -> match ho gaya + already DB me hai  => LOGIN
//    -> match ho gaya + DB me nahi hai     => isi request ke data se REGISTER
router.post('/otp/verify', userController.verifyOtp);

// 3) dedicated registration endpoint for new users
router.post('/register', userController.registerUser);

module.exports = router;