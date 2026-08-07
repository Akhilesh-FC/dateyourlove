// services/callState.js
// In-memory call state. For multi-instance use Redis.
const activeCalls = new Map(); // userId -> callId

function isBusy(userId) { return activeCalls.has(String(userId)); }
function setBusy(userId, callId) { activeCalls.set(String(userId), String(callId)); }
function clearBusy(userId) { activeCalls.delete(String(userId)); }
function getCallId(userId) { return activeCalls.get(String(userId)); }

module.exports = { isBusy, setBusy, clearBusy, getCallId };
