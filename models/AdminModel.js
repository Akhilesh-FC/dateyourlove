// models/AdminModel.js
// Simple model for fetching admin credentials from the database
// Assumes a table `admins` with columns: id (INT PK), email (VARCHAR), password (VARCHAR)
// Passwords are stored in plain text per user request (NOT recommended for production)

const db = require('../config/db');

exports.getAdminByEmail = async (email) => {
  const sql = 'SELECT * FROM admins WHERE email = ? LIMIT 1';
  const [rows] = await db.query(sql, [email]);
  // rows is an array of result objects
  return rows[0] || null;
};
