const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ status: 401, message: 'Missing Authorization header' });
  }

  const matches = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!matches) {
    return res.status(401).json({ status: 401, message: 'Invalid Authorization format' });
  }

  const token = matches[1];
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ status: 401, message: 'Unauthorized', error: err.message });
  }
};
