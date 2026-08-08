const db = require('../../config/db');

exports.showLikeLimits = async (req, res) => {
  try {
    const [limits] = await db.query(`SELECT id, type, max_daily_likes, max_daily_superlikes, created_at, updated_at FROM like_limits ORDER BY created_at DESC`);
    return res.render('administrator/like-limits', { admin: req.session.admin, limits, activePage: 'like-limits', message: req.query.message || null, error: null });
  } catch (err) {
    console.error('ADMIN LIKE LIMITS ERROR:', err);
    return res.render('administrator/like-limits', { admin: req.session.admin, limits: [], activePage: 'like-limits', message: null, error: 'Unable to load like limits' });
  }
};

exports.saveLikeLimits = async (req, res) => {
  try {
    const { ids, max_daily_likes, max_daily_superlikes } = req.body;
    const rows = Array.isArray(ids)
      ? ids.map((id, index) => ({ id: Number(id), max_daily_likes: Number(max_daily_likes[index]), max_daily_superlikes: Number(max_daily_superlikes[index]) }))
      : [{ id: Number(ids), max_daily_likes: Number(max_daily_likes), max_daily_superlikes: Number(max_daily_superlikes) }];

    for (const row of rows) {
      if (!row.id) continue;
      await db.query(
        `UPDATE like_limits SET max_daily_likes = ?, max_daily_superlikes = ?, updated_at = NOW() WHERE id = ?`,
        [row.max_daily_likes, row.max_daily_superlikes, row.id]
      );
    }

    return res.redirect('/admin/like-limits?message=' + encodeURIComponent('Like limits updated successfully'));
  } catch (err) {
    console.error('ADMIN SAVE LIKE LIMITS ERROR:', err);
    return res.redirect('/admin/like-limits?error=' + encodeURIComponent('Unable to save like limits'));
  }
};