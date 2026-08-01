const express = require('express');
const router = express.Router();

// Import sub‑routers
const usersRoutes = require('./usersRoutes');
const settingsRoutes = require('./settingsRoutes');

router.use('/', usersRoutes); // all user‑related endpoints under /api/*
router.use('/', settingsRoutes); // settings endpoints also under /api/*

module.exports = router;
