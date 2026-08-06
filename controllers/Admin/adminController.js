// controllers/admin/adminController.js
// Admin authentication & dashboard rendering (using DB lookup)

const adminModel = require('../../models/AdminModel');
const db = require('../../config/db');
const {
  setActiveAdminSessionId,
  getActiveAdminSessionId,
  clearActiveAdminSessionId,
} = require('../../utils/adminSession');

exports.showLogin = (req, res) => {
  const error = req.query.error;
  const message = req.query.message;
  res.render('admin/login', { error, message });
};

// Process login – validates against admins table
exports.processLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await adminModel.getAdminByEmail(email);
    if (admin && admin.password === password) {
      req.session.admin = {
        id: admin.id,
        email: admin.email,
        sessionId: req.sessionID,
        lastActivity: Date.now(),
      };
      setActiveAdminSessionId(req.sessionID);
      const returnTo = req.query.returnTo || '/admin/dashboard';
      return res.redirect(returnTo);
    }
    const errMsg = encodeURIComponent('Invalid credentials');
    return res.redirect(`/admin/login?error=${errMsg}`);
  } catch (err) {
    console.error('Admin login error:', err);
    const errMsg = encodeURIComponent('Server error');
    return res.redirect(`/admin/login?error=${errMsg}`);
  }
};

exports.logout = (req, res) => {
  clearActiveAdminSessionId();
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};

exports.dashboard = async (req, res) => {
  try {
    const [userCountRows] = await db.query('SELECT COUNT(*) AS count FROM users');
    const [planStatsRows] = await db.query(
      `SELECT
        SUM(status = 'active') AS activePlans,
        SUM(status != 'active') AS inactivePlans,
        COUNT(*) AS totalPlans
       FROM user_subscriptions`
    );
    const [recentSignupRows] = await db.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM users
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`
    );

    const stats = {
      users: Number(userCountRows[0]?.count || 0),
      activePlans: Number(planStatsRows[0]?.activePlans || 0),
      inactivePlans: Number(planStatsRows[0]?.inactivePlans || 0),
      totalPlans: Number(planStatsRows[0]?.totalPlans || 0),
    };

    const chartData = recentSignupRows.map((row) => ({
      label: row.date,
      value: Number(row.count || 0),
    }));

    return res.render('administrator/dashboard', { admin: req.session.admin, stats, chartData });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    const stats = { users: 0, activePlans: 0, inactivePlans: 0, totalPlans: 0 };
    return res.render('administrator/dashboard', { admin: req.session.admin, stats, chartData: [] });
  }
};

exports.showChangePassword = (req, res) => {
  res.render('administrator/change-password', { admin: req.session.admin, error: null, message: null });
};

exports.processChangePassword = async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  if (!current_password || !new_password || !confirm_password) {
    return res.render('administrator/change-password', {
      admin: req.session.admin,
      error: 'All fields are required',
      message: null,
    });
  }
  if (new_password !== confirm_password) {
    return res.render('administrator/change-password', {
      admin: req.session.admin,
      error: 'New password and confirmation do not match',
      message: null,
    });
  }

  try {
    const admin = await adminModel.getAdminById(req.session.admin.id);
    if (!admin || admin.password !== current_password) {
      return res.render('administrator/change-password', {
        admin: req.session.admin,
        error: 'Current password is incorrect',
        message: null,
      });
    }

    await db.query('UPDATE admins SET password = ?, updated_at = NOW() WHERE id = ?', [new_password, admin.id]);
    clearActiveAdminSessionId();
    req.session.destroy(() => {
      res.redirect('/admin/login?message=' + encodeURIComponent('Password changed. Please login again.'));
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.render('administrator/change-password', {
      admin: req.session.admin,
      error: 'Unable to update password',
      message: null,
    });
  }
};
