// middleware/auth.js
// Session‑based protection for admin routes
module.exports = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  }
  // Preserve original URL to redirect after login (optional)
  const returnTo = encodeURIComponent(req.originalUrl);
  return res.redirect(`/admin/login?returnTo=${returnTo}`);
};
