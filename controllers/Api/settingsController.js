const db = require('../../config/db');

// ---------- GET /api/setting ----------
// Ek hi API — table ki saari rows laake, har row ko uske "type" ke naam
// se key bana ke return karta hai.

exports.getSettings = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, type, name, content, created_at, updated_at FROM settings');

    const settings = {};
    rows.forEach((row) => {
      settings[row.type] = row;
    });

    return res.status(200).json(settings);
  } catch (err) {
    console.error('GET SETTINGS ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to fetch settings' });
  }
};

// ---------- POST /api/setting ----------
// Body: { type, name, content } -> naya add karo ya existing type ka content update karo.
// NOTE: abhi ye route public hai. Baad me admin-auth middleware se protect karo,
// warna koi bhi Privacy Policy / Terms ka content badal sakta hai.

exports.upsertSetting = async (req, res) => {
  try {
    const { type, name, content } = req.body;

    if (!type || !name || !content) {
      return res.status(400).json({ message: 'type, name and content are required' });
    }

    await db.query(
      `INSERT INTO settings (type, name, content)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), content = VALUES(content), updated_at = NOW()`,
      [type, name, content]
    );

    const [rows] = await db.query('SELECT id, type, name, content, created_at, updated_at FROM settings WHERE type = ?', [type]);

    return res.status(200).json({
      message: 'Setting saved successfully',
      setting: rows[0],
    });
  } catch (err) {
    console.error('UPSERT SETTING ERROR:', err.message);
    return res.status(500).json({ message: 'Unable to save setting' });
  }
};