const db = require('../../config/db');

exports.showPlans = async (req, res) => {
  try {
    const [counts] = await db.query(
      `SELECT
         SUM(status = 'active') AS activePlans,
         SUM(status != 'active') AS inactivePlans,
         COUNT(*) AS totalPlans
       FROM user_subscriptions`
    );

    const [plans] = await db.query(
      `SELECT us.id, us.user_id, us.status, us.start_date, us.end_date, u.email, u.first_name
       FROM user_subscriptions us
       LEFT JOIN users u ON u.id = us.user_id
       ORDER BY us.updated_at DESC
       LIMIT 50`
    );

    return res.render('administrator/plans', {
      admin: req.session.admin,
      planSummary: counts[0] || { activePlans: 0, inactivePlans: 0, totalPlans: 0 },
      plans,
    });
  } catch (err) {
    console.error('ADMIN PLANS ERROR:', err);
    return res.render('administrator/plans', {
      admin: req.session.admin,
      planSummary: { activePlans: 0, inactivePlans: 0, totalPlans: 0 },
      plans: [],
      error: 'Unable to load plan data',
    });
  }
};
