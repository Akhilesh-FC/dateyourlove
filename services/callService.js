// services/callService.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const callState = require('./callState');
const { getIo } = require('../config/socket');
const { messaging } = require('../config/firebase');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

async function createCallSession({ callerId, calleeId, channelName }) {
  const callUuid = uuidv4();
  const [res] = await db.query(
    `INSERT INTO video_call_sessions (call_uuid, caller_id, callee_id, channel_name, status)
     VALUES (?, ?, ?, ?, 'ringing')`, [callUuid, callerId, calleeId, channelName]
  );
  return { callUuid, id: res.insertId, callerId, calleeId, channelName, status: 'ringing' };
}

async function updateCallStatus(callUuid, status) {
  const updates = [];
  const params = [status, callUuid];

  if (status === 'accepted') {
    updates.push('started_at = NOW()');
  }
  if (status === 'ended') {
    updates.push('ended_at = NOW()');
    updates.push('duration_seconds = IF(started_at IS NOT NULL, TIMESTAMPDIFF(SECOND, started_at, NOW()), NULL)');
  }

  const updateClause = updates.length ? `, ${updates.join(', ')}` : '';
  await db.query(`UPDATE video_call_sessions SET status = ?${updateClause}, updated_at = NOW() WHERE call_uuid = ?`, params);
  const [rows] = await db.query(`SELECT * FROM video_call_sessions WHERE call_uuid = ? LIMIT 1`, [callUuid]);
  return rows[0] || null;
}

async function getCallSession(callUuid) {
  const [rows] = await db.query(`SELECT * FROM video_call_sessions WHERE call_uuid = ? LIMIT 1`, [callUuid]);
  return rows[0] || null;
}

async function cleanupExpiredRingingCalls(ageSeconds = 45) {
  await db.query(
    `UPDATE video_call_sessions
     SET status = 'missed', updated_at = NOW()
     WHERE status = 'ringing' AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [ageSeconds]
  );
}

async function isUserInActiveCall(userId) {
  const [rows] = await db.query(
    `SELECT call_uuid FROM video_call_sessions
     WHERE (caller_id = ? OR callee_id = ?)
       AND (
         status IN ('accepted', 'busy')
         OR (status = 'ringing' AND created_at > DATE_SUB(NOW(), INTERVAL 45 SECOND))
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, userId]
  );
  return rows[0] ? rows[0].call_uuid : null;
}

function isSessionStatusActive(status) {
  return ['ringing', 'accepted', 'busy'].includes(String(status));
}

async function generateAgoraToken(channelName, uid) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const expireSeconds = parseInt(process.env.AGORA_TOKEN_EXPIRE_SECONDS || '3600', 10);

  if (!appId || !appCertificate) {
    throw new Error('Agora App ID and App Certificate are required');
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expireSeconds;
  const numericUid = Number(uid) || 0;

  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    numericUid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs
  );
}

async function sendIncomingCallPush({ calleeId, callerName, channelName, callId }) {
  try {
    if (!messaging) return false;
    const payload = {
      notification: {
        title: 'Incoming video call',
        body: `${callerName || 'Someone'} is calling you`,
      },
      data: {
        type: 'incoming_call',
        callId: String(callId),
        channelName: String(channelName),
        callerName: String(callerName || ''),
      },
    };
    // Lookup FCM tokens for callee from DB
    let rows;
    try {
      const result = await db.query('SELECT fcm_token FROM user_devices WHERE user_id = ? AND fcm_token IS NOT NULL', [calleeId]);
      rows = result[0];
    } catch (err) {
      if (err && err.code === 'ER_NO_SUCH_TABLE') {
        const [fallbackRows] = await db.query('SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL', [calleeId]);
        rows = fallbackRows;
      } else {
        throw err;
      }
    }
    if (!rows || !rows.length) return false;
    const tokens = rows.map(r => r.fcm_token).filter(Boolean);
    if (!tokens.length) return false;
    if (typeof messaging.sendMulticast === 'function') {
      await messaging.sendMulticast({ tokens, notification: payload.notification, data: payload.data });
      return true;
    }
    for (const token of tokens) {
      await messaging.send({ token, notification: payload.notification, data: payload.data });
    }
    return true;
  } catch (err) {
    console.warn('sendIncomingCallPush error', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { createCallSession, updateCallStatus, cleanupExpiredRingingCalls, isUserInActiveCall, generateAgoraToken, callState, sendIncomingCallPush };
