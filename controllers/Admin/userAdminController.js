const db = require('../../config/db');

exports.showUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id, email, mobile, first_name, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return res.render('administrator/users', { admin: req.session.admin, users });
  } catch (err) {
    console.error('ADMIN USERS ERROR:', err);
    return res.render('administrator/users', { admin: req.session.admin, users: [], error: 'Unable to load users' });
  }
};
