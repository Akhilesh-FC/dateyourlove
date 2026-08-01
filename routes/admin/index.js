const express = require('express');
const path = require('path');
const router = express.Router();

const { verifyAdmin } = require('../../models/Admin');

// Middleware to protect admin pages
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect('/admin/login');
}

// GET login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/login.html'));
});

// POST login – verify against DB
router.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await verifyAdmin(email, password);
    if (admin) {
      req.session.admin = { id: admin.id, email: admin.email };
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/admin/login?error=1');
  } catch (err) {
    console.error('ADMIN LOGIN ERROR:', err);
    return res.redirect('/admin/login?error=1');
  }
});

// Admin dashboard (protected)
router.get('/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/dashboard.html'));
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
