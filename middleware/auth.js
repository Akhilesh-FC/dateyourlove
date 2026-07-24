// Simple admin auth middleware: checks `x-admin-token` header against ADMIN_TOKEN env
module.exports = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'admin token not configured' });
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
};
