const express = require('express');
const router = express.Router();

// Import sub‑routers
const usersRoutes = require('./usersRoutes');
const settingsRoutes = require('./settingsRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const chatRoutes = require('./chatRoutes');
const callRoutes = require('./callRoutes');

router.use('/', usersRoutes); // all user-related endpoints under /api/*
router.use('/', settingsRoutes); // settings endpoints also under /api/*
router.use('/', subscriptionRoutes); // subscription endpoints under /api/*
router.use('/chat', chatRoutes); // chat endpoints under /api/chat/*
router.use('/call', callRoutes); // call endpoints under /api/call/*

module.exports = router;
