// controllers/Api/adminController.js
const db = require('../../config/db');

// GET all like limits
exports.getLikeLimits = async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT id, type, max_daily_likes, max_daily_superlikes, created_at, updated_at FROM like_limits`);
    return res.status(200).json({ count: rows.length, limits: rows });
  } catch (err) {
    console.error('GET LIKE LIMITS ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch like limits' });
  }
};

// UPDATE a specific limit (by type)
exports.updateLikeLimit = async (req, res) => {
  const { type } = req.params; // e.g. 'free_user'
  const { max_daily_likes, max_daily_superlikes } = req.body;
  if (max_daily_likes === undefined && max_daily_superlikes === undefined) {
    return res.status(400).json({ message: 'At least one field to update required' });
  }
  try {
    const fields = [];
    const values = [];
    if (max_daily_likes !== undefined) {
      fields.push('max_daily_likes = ?');
      values.push(max_daily_likes);
    }
    if (max_daily_superlikes !== undefined) {
      fields.push('max_daily_superlikes = ?');
      values.push(max_daily_superlikes);
    }
    values.push(type);
    const sql = `UPDATE like_limits SET ${fields.join(', ')}, updated_at = NOW() WHERE type = ?`;
    const [{ affectedRows }] = await db.query(sql, values);
    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Like limit type not found' });
    }
    return res.status(200).json({ message: 'Like limit updated' });
  } catch (err) {
    console.error('UPDATE LIKE LIMIT ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to update like limit' });
  }
};
