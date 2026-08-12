const db = require('../config/db');

async function isUserBlockedBy(blockerId, blockedId) {
  const [rows] = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE blocker_id = ?
       AND blocked_id = ?
     LIMIT 1`,
    [blockerId, blockedId]
  );
  return rows.length > 0;
}

async function isUserBlockedBetween(userA, userB) {
  return (await isUserBlockedBy(userA, userB)) || (await isUserBlockedBy(userB, userA));
}

module.exports = {
  isUserBlockedBy,
  isUserBlockedBetween,
};
