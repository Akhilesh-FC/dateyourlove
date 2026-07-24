const express = require('express');
const router = express.Router();
const adminController = require('../controllers/Admin/adminController');

router.get('/', adminController.dashboard);

module.exports = router;
