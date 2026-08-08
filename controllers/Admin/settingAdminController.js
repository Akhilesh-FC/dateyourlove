const db = require('../../config/db');

exports.showSettings = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT id, type, name, content, created_at, updated_at FROM settings ORDER BY type ASC');
    return res.render('administrator/settings', { admin: req.session.admin, settings, activePage: 'settings', message: req.query.message || null, error: null });
  } catch (err) {
    console.error('ADMIN SETTINGS ERROR:', err);
    return res.render('administrator/settings', { admin: req.session.admin, settings: [], activePage: 'settings', message: null, error: 'Unable to load settings' });
  }
};

exports.saveSetting = async (req, res) => {
  try {
    const { type, name, content } = req.body;
    if (!type || !name || !content) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('Type, name and content are required'));
    }

    await db.query(
      `INSERT INTO settings (type, name, content)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), content = VALUES(content), updated_at = NOW()`,
      [type, name, content]
    );

    return res.redirect('/admin/settings?message=' + encodeURIComponent('Setting saved successfully'));
  } catch (err) {
    console.error('ADMIN SAVE SETTING ERROR:', err);
    return res.redirect('/admin/settings?error=' + encodeURIComponent('Unable to save setting'));
  }
};