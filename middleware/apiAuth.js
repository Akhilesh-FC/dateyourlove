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
  if (!process.env.API_TOKEN) {
    return res.status(500).json({ status: 500, message: 'API token not configured' });
  }

  if (token !== process.env.API_TOKEN) {
    return res.status(401).json({ status: 401, message: 'Unauthorized' });
  }

  next();
};
