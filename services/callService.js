// services/callService.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const callState = require('./callState');
const { getIo } = require('../config/socket');
const { messaging } = require('../config/firebase');

async function createCallSession({ callerId, calleeId, channelName }) {
  const callUuid = uuidv4();
  const [res] = await db.query(
    `INSERT INTO video_call_sessions (call_uuid, caller_id, callee_id, channel_name, status)
     VALUES (?, ?, ?, ?, 'ringing')`, [callUuid, callerId, calleeId, channelName]
  );
  return { callUuid, id: res.insertId, callerId, calleeId, channelName, status: 'ringing' };
}

async function updateCallStatus(callUuid, status) {
  await db.query(`UPDATE video_call_sessions SET status = ?, updated_at = NOW() WHERE call_uuid = ?`, [status, callUuid]);
  const [rows] = await db.query(`SELECT * FROM video_call_sessions WHERE call_uuid = ? LIMIT 1`, [callUuid]);
  return rows[0] || null;
}

async function getCallSession(callUuid) {
  const [rows] = await db.query(`SELECT * FROM video_call_sessions WHERE call_uuid = ? LIMIT 1`, [callUuid]);
  return rows[0] || null;
}

async function isUserInActiveCall(userId) {
  const [rows] = await db.query(
    `SELECT call_uuid FROM video_call_sessions WHERE (caller_id = ? OR callee_id = ?) AND status IN ('ringing', 'accepted', 'busy') LIMIT 1`,
    [userId, userId]
  );
  return rows[0] ? rows[0].call_uuid : null;
}

function isSessionStatusActive(status) {
  return ['ringing', 'accepted', 'busy'].includes(String(status));
}

// Placeholder: implement real Agora token generation server-side
async function generateAgoraToken(channelName, uid) {
  return { token: 'AGORA_TOKEN_PLACEHOLDER', channelName, uid };
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

module.exports = { createCallSession, updateCallStatus, isUserInActiveCall, generateAgoraToken, callState, sendIncomingCallPush };
