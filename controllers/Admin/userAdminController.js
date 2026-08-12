const db = require('../../config/db');

exports.showUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const [[countRows]] = await db.query('SELECT COUNT(*) AS total FROM users');
    const totalUsers = Number(countRows.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    const [users] = await db.query(
      `SELECT u.*,
         (SELECT url FROM user_photos WHERE user_id = u.id ORDER BY id ASC LIMIT 1) AS photo_url,
         us.plan_name AS current_plan_name, us.duration_type AS current_plan_duration, us.status AS current_plan_status
       FROM users u
       LEFT JOIN user_subscriptions us ON us.id = (
         SELECT id FROM user_subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return res.render('administrator/users', {
      admin: req.session.admin,
      users,
      activePage: 'users',
      page,
      totalPages,
      totalUsers,
    });
  } catch (err) {
    console.error('ADMIN USERS ERROR:', err);
    return res.render('administrator/users', {
      admin: req.session.admin,
      users: [],
      error: 'Unable to load users',
      page: 1,
      totalPages: 1,
      totalUsers: 0,
    });
  }
};

exports.showUserDetail = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) throw new Error('Invalid user id');

    const [[userRow]] = await db.query(
      `SELECT u.*,
         (SELECT url FROM user_photos WHERE user_id = u.id ORDER BY id ASC LIMIT 1) AS photo_url
       FROM users u WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    if (!userRow) {
      return res.render('administrator/user-detail', { admin: req.session.admin, user: null, subscriptions: [], error: 'User not found', activePage: 'users' });
    }

    const [subscriptions] = await db.query(
      `SELECT us.*, pd.type AS duration_type, pd.price AS duration_price, p.name AS plan_name
       FROM user_subscriptions us
       LEFT JOIN plan_durations pd ON pd.id = us.plan_duration_id
       LEFT JOIN plans p ON p.id = pd.plan_id
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC`,
      [userId]
    );

    return res.render('administrator/user-detail', {
      admin: req.session.admin,
      user: userRow,
      subscriptions,
      activePage: 'users',
      error: null,
    });
  } catch (err) {
    console.error('ADMIN USER DETAIL ERROR:', err);
    return res.render('administrator/user-detail', { admin: req.session.admin, user: null, subscriptions: [], error: 'Unable to load user details', activePage: 'users' });
  }
};
