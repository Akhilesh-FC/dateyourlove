// controllers/admin/adminController.js
// Admin authentication & dashboard rendering (using DB lookup)

const adminModel = require('../../models/AdminModel');

exports.showLogin = (req, res) => {
  const error = req.query.error;
  res.render('admin/login', { error });
};

// Process login – validates against admins table
exports.processLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await adminModel.getAdminByEmail(email);
    if (admin && admin.password === password) {
      req.session.admin = { email: admin.email };
      const returnTo = req.query.returnTo || '/admin/dashboard';
      return res.redirect(returnTo);
    }
    const errMsg = encodeURIComponent('Invalid credentials');
    res.redirect(`/admin/login?error=${errMsg}`);
  } catch (err) {
    console.error('Admin login error:', err);
    const errMsg = encodeURIComponent('Server error');
    res.redirect(`/admin/login?error=${errMsg}`);
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};

exports.dashboard = async (req, res) => {
  // Placeholder stats – replace with real DB queries later
  const stats = { users: 0, products: 0, combos: 0, likes: 0 };
  res.render('administrator/dashboard', { admin: req.session.admin, stats });
};
