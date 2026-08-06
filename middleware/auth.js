// middleware/auth.js
// Session‑based protection for admin routes
const {
  getActiveAdminSessionId,
} = require('../utils/adminSession');

const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

module.exports = (req, res, next) => {
  if (req.session && req.session.admin) {
    const sessionAdmin = req.session.admin;
    const activeSessionId = getActiveAdminSessionId();
    if (!activeSessionId || activeSessionId !== req.sessionID) {
      req.session.destroy(() => {
        res.redirect('/admin/login?error=' + encodeURIComponent('Logged out due to another login'));
      });
      return;
    }

    const lastActivity = Number(sessionAdmin.lastActivity || 0);
    if (Date.now() - lastActivity > ADMIN_INACTIVITY_TIMEOUT_MS) {
      req.session.destroy(() => {
        res.redirect('/admin/login?error=' + encodeURIComponent('Session expired due to inactivity'));
      });
      return;
    }

    req.session.admin.lastActivity = Date.now();
    return next();
  }
  const returnTo = encodeURIComponent(req.originalUrl);
  return res.redirect(`/admin/login?returnTo=${returnTo}`);
};
