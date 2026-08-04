const express = require('express');
const router = express.Router();

// Import sub‑routers
const usersRoutes = require('./usersRoutes');
const settingsRoutes = require('./settingsRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const chatRoutes = require('./chatRoutes');

router.use('/', usersRoutes); // all user‑related endpoints under /api/*
router.use('/', settingsRoutes); // settings endpoints also under /api/*
router.use('/', subscriptionRoutes); // subscription endpoints under /api/*
router.use('/chat', chatRoutes); // chat endpoints under /api/chat/*

module.exports = router;
