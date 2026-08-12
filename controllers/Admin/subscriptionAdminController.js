const db = require('../../config/db');

exports.showSubscriptions = async (req, res) => {
  try {
    const [subscriptions] = await db.query(
      `SELECT
         us.id,
         us.user_id,
         us.plan_name,
         us.duration_type,
         us.price_paid,
         us.status,
         us.start_date,
         us.end_date,
         us.created_at,
         us.paytm_order_id,
         us.paytm_txn_id,
         u.first_name  AS user_name,
         u.mobile      AS user_mobile,
         (SELECT url FROM user_photos WHERE user_id = u.id ORDER BY id ASC LIMIT 1) AS user_photo,
         p.name        AS plan_name_master,
         pd.type       AS duration_label,
         pd.price      AS duration_price
       FROM user_subscriptions us
       LEFT JOIN users u          ON u.id  = us.user_id
       LEFT JOIN plan_durations pd ON pd.id = us.plan_duration_id
       LEFT JOIN plans p           ON p.id  = pd.plan_id
       ORDER BY us.created_at DESC
       LIMIT 200`
    );

    return res.render('administrator/subscriptions', {
      admin: req.session.admin,
      subscriptions,
      activePage: 'subscriptions',
      message: req.query.message || null,
      error: null,
    });
  } catch (err) {
    console.error('ADMIN SUBSCRIPTIONS ERROR:', err);
    return res.render('administrator/subscriptions', {
      admin: req.session.admin,
      subscriptions: [],
      activePage: 'subscriptions',
      message: null,
      error: 'Unable to load subscriptions',
    });
  }
};
