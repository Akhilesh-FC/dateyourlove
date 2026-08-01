// models/Admin.js – simple DB helper for admin authentication
// Uses the existing MySQL pool from config/db.js
const db = require('../config/db');

/**
 * Verify admin credentials (plain‑text password as per request).
 * Returns the admin record if email and password match, otherwise null.
 */
async function verifyAdmin(email, password) {
  const sql = `SELECT id, email, password FROM admins WHERE email = ? AND password = ? LIMIT 1`;
  const [rows] = await db.query(sql, [email, password]);
  if (rows && rows.length) {
    return rows[0];
  }
  return null;
}

module.exports = { verifyAdmin };
