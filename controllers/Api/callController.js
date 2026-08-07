// controllers/Api/callController.js
const db = require('../../config/db');
const callService = require('../../services/callService');
const callState = require('../../services/callState');
const chatService = require('../../services/chatService');
const { getIo, isUserOnline } = require('../../config/socket');

// POST /api/call/request
exports.requestCall = async (req, res) => {
  try {
    const callerId = req.user.id;
    const { calleeId } = req.body;
    if (!calleeId) return res.status(400).json({ message: 'calleeId required' });

    // subscription check
    const callerHasPlan = await chatService.userHasActiveSubscription(callerId);
    if (!callerHasPlan) return res.status(403).json({ message: 'Active subscription required' });

    const callerActiveCall = await callService.isUserInActiveCall(callerId);
    if (callerActiveCall) {
      if (!callState.isBusy(callerId)) callState.setBusy(callerId, callerActiveCall);
      return res.status(409).json({ message: 'Caller already in another call' });
    }
    if (callState.isBusy(callerId)) {
      callState.clearBusy(callerId);
    }

    const calleeActiveCall = await callService.isUserInActiveCall(calleeId);
    if (calleeActiveCall) {
      if (!callState.isBusy(calleeId)) callState.setBusy(calleeId, calleeActiveCall);
      return res.status(409).json({ message: 'Callee is busy' });
    }
    if (callState.isBusy(calleeId)) {
      callState.clearBusy(calleeId);
    }

    const channelName = `call_${Math.floor(Date.now()/1000)}_${callerId}_${calleeId}`;
    const session = await callService.createCallSession({ callerId, calleeId, channelName });

    // mark busy locally
    callState.setBusy(callerId, session.callUuid);
    callState.setBusy(calleeId, session.callUuid);

    // emit incoming_call to callee if online
    const io = getIo();
    const payload = {
      callId: session.callUuid,
      callerId,
      channelName,
      timestamp: Date.now(),
    };
    let emitted = false;
    if (io) {
      io.to(`user_${calleeId}`).emit('incoming_call', payload);
      emitted = isUserOnline(calleeId);
    }

    // send push notification via firebase (best-effort)
    const callerNameRow = await db.query('SELECT first_name FROM users WHERE id = ?', [callerId]).catch(() => null);
    const callerName = callerNameRow && callerNameRow[0] && callerNameRow[0][0] ? callerNameRow[0][0].first_name : 'Someone';
    try {
      await callService.sendIncomingCallPush({ calleeId, callerName, channelName, callId: session.callUuid });
    } catch (e) {
      // ignore push errors
    }

    return res.status(200).json({ success: true, callId: session.callUuid, emitted });
  } catch (err) {
    console.error('REQUEST CALL ERROR', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Unable to create call' });
  }
};

// POST /api/call/respond
exports.respondCall = async (req, res) => {
  try {
    const userId = req.user.id;
    const { callId, action } = req.body;
    if (!callId || !action) return res.status(400).json({ message: 'callId and action required' });

    const updated = await callService.updateCallStatus(callId, action === 'accept' ? 'accepted' : 'declined');
    if (!updated) return res.status(404).json({ message: 'Call not found' });

    const io = getIo();
    const otherUserId = (Number(updated.caller_id) === Number(userId)) ? updated.callee_id : updated.caller_id;

    if (action === 'accept') {
      const tokenObj = await callService.generateAgoraToken(updated.channel_name, userId);
      if (io) io.to(`user_${otherUserId}`).emit('call_accepted', { callId, channelName: updated.channel_name, agoraToken: tokenObj.token });
      return res.status(200).json({ success: true, callId, channelName: updated.channel_name, agoraToken: tokenObj.token });
    } else {
      if (io) io.to(`user_${otherUserId}`).emit('call_declined', { callId, reason: 'user_declined' });
      // clear busy flags
      callState.clearBusy(updated.caller_id);
      callState.clearBusy(updated.callee_id);

      // send push to caller informing decline (best-effort)
      try {
        let rows;
        try {
          const result = await db.query('SELECT fcm_token FROM user_devices WHERE user_id = ? AND fcm_token IS NOT NULL', [otherUserId]);
          rows = result[0];
        } catch (err) {
          if (err && err.code === 'ER_NO_SUCH_TABLE') {
            const fallback = await db.query('SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL', [otherUserId]);
            rows = fallback[0];
          } else {
            throw err;
          }
        }
        if (rows && rows.length) {
          const { messaging } = require('../../config/firebase');
          const tokens = rows.map(r => r.fcm_token).filter(Boolean);
          if (tokens.length && messaging) {
            const payload = {
              notification: { title: 'Call declined', body: 'User declined your call' },
              data: { type: 'call_declined', callId: String(callId) }
            };
            if (typeof messaging.sendMulticast === 'function') {
              await messaging.sendMulticast({ tokens, notification: payload.notification, data: payload.data });
            } else {
              for (const t of tokens) await messaging.send({ token: t, notification: payload.notification, data: payload.data });
            }
          }
        }
      } catch (e) {
        // ignore push errors
      }

      return res.status(200).json({ success: true, callId, status: 'declined' });
    }
  } catch (err) {
    console.error('RESPOND CALL ERROR', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Unable to respond to call' });
  }
};

// POST /api/call/end
exports.endCall = async (req, res) => {
  try {
    const userId = req.user.id;
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ message: 'callId required' });

    const updated = await callService.updateCallStatus(callId, 'ended');
    if (!updated) return res.status(404).json({ message: 'Call not found' });

    // clear busy flags
    callState.clearBusy(updated.caller_id);
    callState.clearBusy(updated.callee_id);

    const io = getIo();
    const otherUserId = (Number(updated.caller_id) === Number(userId)) ? updated.callee_id : updated.caller_id;
    if (io) io.to(`user_${otherUserId}`).emit('call_ended', { callId });

    return res.status(200).json({ success: true, callId });
  } catch (err) {
    console.error('END CALL ERROR', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Unable to end call' });
  }
};
