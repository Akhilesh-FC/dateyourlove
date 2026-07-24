const jwt = require('jsonwebtoken');

const getJwtSecret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-me');

// Login/verify/register APIs jo token dete hain, wahi token yahan
// "Authorization: Bearer <token>" header me bhejna hoga.
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const matches = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!matches) {
    return res.status(401).json({ message: 'Invalid Authorization format. Use: Bearer <token>' });
  }

  const token = matches[1];
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({ message: 'JWT secret not configured' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret); // { id, mobile }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};