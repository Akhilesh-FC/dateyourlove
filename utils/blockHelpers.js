const db = require('../config/db');

async function isUserBlockedBetween(userA, userB) {
  const [rows] = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = ? AND blocked_id = ?)
        OR (blocker_id = ? AND blocked_id = ?)
     LIMIT 1`,
    [userA, userB, userB, userA]
  );
  return rows.length > 0;
}

module.exports = {
  isUserBlockedBetween,
};
