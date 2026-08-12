const db = require('../../config/db');

exports.showLikeLimits = async (req, res) => {
  try {
    const [limits] = await db.query('SELECT id, type, max_daily_likes, max_daily_superlikes, created_at, updated_at FROM like_limits ORDER BY created_at DESC');
    return res.render('administrator/like-limits', { admin: req.session.admin, limits, activePage: 'like-limits', message: req.query.message || null, error: null });
  } catch (err) {
    console.error('ADMIN LIKE LIMITS ERROR:', err);
    return res.render('administrator/like-limits', { admin: req.session.admin, limits: [], activePage: 'like-limits', message: null, error: 'Unable to load like limits' });
  }
};

exports.saveSingleLimit = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const likes = Number(req.body.max_daily_likes);
    const superlikes = Number(req.body.max_daily_superlikes);
    if (!id) throw new Error('Invalid id');
    await db.query('UPDATE like_limits SET max_daily_likes = ?, max_daily_superlikes = ?, updated_at = NOW() WHERE id = ?', [likes, superlikes, id]);
    return res.redirect('/admin/like-limits?message=' + encodeURIComponent('Limit updated successfully'));
  } catch (err) {
    console.error('ADMIN SAVE SINGLE LIMIT ERROR:', err);
    return res.redirect('/admin/like-limits?error=' + encodeURIComponent('Unable to save limit'));
  }
};

exports.saveLikeLimits = async (req, res) => {
  try {
    const { ids, max_daily_likes, max_daily_superlikes } = req.body;
    const rows = Array.isArray(ids)
      ? ids.map((id, i) => ({ id: Number(id), likes: Number(max_daily_likes[i]), superlikes: Number(max_daily_superlikes[i]) }))
      : [{ id: Number(ids), likes: Number(max_daily_likes), superlikes: Number(max_daily_superlikes) }];
    for (const row of rows) {
      if (!row.id) continue;
      await db.query('UPDATE like_limits SET max_daily_likes = ?, max_daily_superlikes = ?, updated_at = NOW() WHERE id = ?', [row.likes, row.superlikes, row.id]);
    }
    return res.redirect('/admin/like-limits?message=' + encodeURIComponent('Like limits updated successfully'));
  } catch (err) {
    console.error('ADMIN SAVE LIKE LIMITS ERROR:', err);
    return res.redirect('/admin/like-limits?error=' + encodeURIComponent('Unable to save like limits'));
  }
};
