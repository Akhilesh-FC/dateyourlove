# VIDEO_CALL.md

## Overview
यह डॉक आपको बताता है कि existing chat सिस्टम को बदले बिना कैसे अलग वीडियो-कॉल मॉड्यूल जोड़ना है। Signaling के लिए Socket.IO और media के लिए Agora उपयोग होगा। Backend REST endpoints call-control के लिए और Socket.IO कॉल-इवेंट notify के लिए होंगे.

## High-level flow
1. Caller UI → POST /api/call/request (backend)
2. Backend validates (auth, subscription, callee exists, busy check), बनाता है call session और emit करता है incoming_call to callee socket room.
3. Callee socket receives incoming_call → दिखाओ incoming UI (accept / decline)
4. Callee clicks accept/decline → POST /api/call/respond
5. Backend updates session, अगर accept तो generate Agora token और emit करता है call_accepted to caller; decline पर emit call_declined और clear busy
6. दोनों Agora channel join कर के media शुरू करते हैं
7. End → POST /api/call/end → backend emits call_ended और clears busy state

## New Socket events (signaling only)
- call_request (optional; prefer REST request)
- incoming_call (server → callee)
  - payload: { callId, callerId, callerName?, channelName, timestamp, callerAvatar? }
- call_accepted (server → caller)
  - payload: { callId, channelName, agoraToken, uid? }
- call_declined (server → caller)
  - payload: { callId, reason }
- call_busy (server → caller)
  - payload: { callId, reason:'busy' }
- call_ended (server → other)
  - payload: { callId }
- call_missed (server → caller) — optional, when ring timeout

Use existing socket rooms user_<id> from current `config/socket.js`.

## REST endpoints (controllers/Api/callController.js)
- POST /api/call/request
  - Body: { calleeId: number }
  - Auth required
  - Returns: { success, callId, emitted }
  - Actions: validation (auth, subscription via existing chatService.userHasActiveSubscription), busy checks, create video_call_sessions row, set busy in in-memory map, emit incoming_call to callee if online.
- POST /api/call/respond
  - Body: { callId: string, action: 'accept'|'decline' }
  - Auth required
  - If accept: update session -> status accepted, generate Agora token, emit call_accepted to other user, return token to responder.
  - If decline: update session -> status declined, emit call_declined, clear busy flags.
- POST /api/call/end
  - Body: { callId: string }
  - Auth required
  - Update session status ended, set ended_at/duration, emit call_ended, clear busy.

## Required DB tables
You need the following tables for the new video call flow:

- `video_call_sessions` — stores call state and channel metadata.
- `user_devices` — stores FCM device tokens for incoming call / decline notifications. If you already have a device token table, use that instead.

## DB migration (migrations/20260807_create_video_call_sessions.sql)
```sql
CREATE TABLE IF NOT EXISTS video_call_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  call_uuid VARCHAR(100) NOT NULL UNIQUE,
  caller_id INT NOT NULL,
  callee_id INT NOT NULL,
  channel_name VARCHAR(200) NOT NULL,
  status ENUM('ringing','accepted','declined','busy','ended','missed') NOT NULL DEFAULT 'ringing',
  started_at DATETIME DEFAULT NULL,
  ended_at DATETIME DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

If you do not yet have a `user_devices` table, create one like this:
```sql
CREATE TABLE IF NOT EXISTS user_devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  fcm_token VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (user_id, fcm_token)
);
```

## Call test page
A new browser test page is available at:
- `/video-call-test.html`

Use this page to:
- connect your socket as a user
- send `/api/call/request`
- respond with `/api/call/respond`
- emit `/api/call/end`
- validate incoming `incoming_call`, `call_accepted`, `call_declined`, and `call_ended` events

This page is modeled after your existing `socket-test.html` but focused on call signaling.

## Server helpers

### services/callState.js (in-memory)
```js
const activeCalls = new Map(); // userId -> callId
function isBusy(userId) { return activeCalls.has(String(userId)); }
function setBusy(userId, callId) { activeCalls.set(String(userId), String(callId)); }
function clearBusy(userId) { activeCalls.delete(String(userId)); }
function getCallId(userId) { return activeCalls.get(String(userId)); }
module.exports = { isBusy, setBusy, clearBusy, getCallId };
```

Note: For multi-instance/scale use Redis keys + pub/sub rather than in-memory.

### services/callService.js (outline)
- createCallSession({ callerId, calleeId, channelName }) → inserts row, returns callUuid
- updateCallStatus(callUuid, status) → updates row, returns row
- generateAgoraToken(channelName, uid) → integrate Agora AppID/AppCertificate to issue temp token (placeholder until implemented)

## Controller outline (controllers/Api/callController.js)
- requestCall: validate, check subscriber (use existing chatService.userHasActiveSubscription), check callState.isBusy for both users, create session, setBusy(caller, callId), setBusy(callee, callId), emit incoming_call via getIo().to(`user_${calleeId}`)
- respondCall: update status, if accept generate token (callService.generateAgoraToken), emit call_accepted to other user, on decline emit call_declined and clear busy
- endCall: mark ended, clear busy, emit call_ended

Mount route: add routes/api/callRoutes.js and register in routes/api/index.js with app.use('/api/call', callRoutes). (If you prefer manual step, add that single line yourself.)

## Example payloads

incoming_call
{
  "callId": "uuid-123",
  "callerId": 12,
  "callerName": "Ravi",
  "channelName": "call_1690000000_12_15",
  "timestamp": 1690000000000
}

call_accepted
{
  "callId": "uuid-123",
  "channelName": "call_1690000000_12_15",
  "agoraToken": "REAL_TOKEN_FROM_SERVER"
}

call_declined
{
  "callId": "uuid-123",
  "reason": "user_declined"
}

## Frontend sequence (mobile / web)

1. Connect socket and join room (existing code): socket.emit('join', { userId })
2. Caller taps video call:
   - Fetch POST /api/call/request { calleeId }
   - If backend returns emitted:true -> callee will get incoming_call socket event.
   - If backend returns 409 (callee busy) -> show "User is busy"
3. Callee receives incoming_call via socket:
   - Show full-screen incoming UI (ringer)
   - On Accept:
     - POST /api/call/respond { callId, action: 'accept' } → response includes agoraToken/channelName
     - Initialize Agora client and join channel with returned token
     - On success inform UI; caller will get call_accepted socket event and also join Agora
   - On Decline:
     - POST /api/call/respond { callId, action: 'decline' } → backend emits call_declined to caller; clear UI
4. Caller receives call_accepted:
   - Use received agoraToken/channelName to join Agora
5. Ending call:
   - When user taps hangup: POST /api/call/end { callId } → backend emits call_ended to other user; both leave Agora and clear UI

## Push notification flow (incoming / declined)

1. When backend creates a call session and emits `incoming_call` via Socket.IO, it will also attempt a best-effort push notification to the callee using the existing Firebase setup. The payload should include caller name and `callId` so the client can deep-link into the app or show a rich notification.

2. Push payload example (FCM):
```json
{
  "notification": { "title": "Incoming video call", "body": "Akhil is calling you" },
  "data": { "type": "incoming_call", "callId": "uuid-123", "channelName": "call_...", "callerName": "Akhil" }
}
```

3. If the callee declines the call, the server will send a best-effort push notification to the caller informing them the call was declined. Example payload:
```json
{
  "notification": { "title": "Call declined", "body": "Akhil declined your call" },
  "data": { "type": "call_declined", "callId": "uuid-123" }
}
```

4. Implementation notes:
- The server code performs push sends as best-effort; failures are logged but do not block the REST response.
- Push tokens are read from `user_devices` table (schema assumed; create if missing) — store per-device FCM tokens there.
- Mobile clients should handle `data.type` values (`incoming_call`, `call_declined`) to navigate to the correct UI.

### Agora SDK notes
- Web: use agora-rtc-sdk-ng
- Mobile: use Agora native/ReactNative SDKs
- Token generation: must be server-side using App ID + App Certificate; do NOT embed App Certificate in client.

### Agora App ID, channel name, UID, and token flow
- App ID: store in server env as `AGORA_APP_ID` and on client use only for initializing the SDK.
- Channel name: use a deterministic unique name per call, e.g. `call_<timestamp>_<callerId>_<calleeId>` or `video_call_<callUuid>`.
- UID: allocate a numeric UID per user for Agora join. You can use the current user ID or a random one from the server.
- Token: server should generate a short-lived RTC token after the callee accepts.

Example flow:
1. Caller request creates session and channel name: `call_1712345678_12_15`.
2. Callee accepts; server generates Agora token for that channel and the appropriate UID.
3. Server returns `{ channelName, agoraToken, uid }` to the callee, and emits `call_accepted` to the caller with the same token info.
4. Both clients call Agora `client.join(appId, channelName, agoraToken, uid)`.

Sample server-side token payload:
- `appId: process.env.AGORA_APP_ID`
- `channelName: call_1712345678_12_15`
- `uid: 12` (or a generated number)
- `expiry: 30` seconds or a few minutes

Sample client join sequence:
```js
const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
await client.join(appId, channelName, agoraToken, uid);
const localTrack = await AgoraRTC.createMicrophoneAndCameraTracks();
await client.publish(localTrack);
client.on('user-published', async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  if (mediaType === 'video') {
    const remoteTrack = user.videoTrack;
    remoteTrack.play('remote-video-container');
  }
});
```

### Why use App ID + token
- App ID alone allows only open access.
- Token protects your Agora channel and limits each call to authorized users.
- Generate the token server-side using App Certificate and send it to caller/callee only after call acceptance.

## Implementation plan
1. Add `.env` variables:
   - `AGORA_APP_ID=<your app id>`
   - `AGORA_APP_CERTIFICATE=<your app certificate>`
   - `AGORA_TOKEN_EXPIRE_SECONDS=180` (optional)
2. Update `services/callService.js` to use `process.env.AGORA_APP_ID` and `process.env.AGORA_APP_CERTIFICATE` when generating token.
3. Keep the existing chat code unchanged. Add new files only:
   - `services/callState.js`
   - `services/callService.js`
   - `controllers/Api/callController.js`
   - `routes/api/callRoutes.js`
   - `migrations/20260807_create_video_call_sessions.sql`
4. Mount the new route in `routes/api/index.js`:
   - `const callRoutes = require('./callRoutes');`
   - `app.use('/api/call', callRoutes);`
5. Frontend flow:
   - Caller POST `/api/call/request`
   - Callee socket receives `incoming_call`
   - Callee POST `/api/call/respond` with accept/decline
   - Both clients join Agora with returned `channelName`, `agoraToken`, and `uid`
6. Push notification flow:
   - Incoming call notification to callee
   - Decline notification to caller

### `.env` placement
Put these in your project root `.env` file; `server.js` already loads `dotenv`.
```env
AGORA_APP_ID=YOUR_AGORA_APP_ID
AGORA_APP_CERTIFICATE=YOUR_AGORA_APP_CERTIFICATE
AGORA_TOKEN_EXPIRE_SECONDS=180
```

## Edge cases & UX
- Callee offline: incoming_call not delivered; backend can return emitted:false and store session; optionally send push notification via existing firebase service.
- Ring timeout: if callee neither accepts nor declines in X seconds (e.g., 30s), mark session missed and emit call_missed to caller, clear busy.
- Busy: if callee is in another call, return 409 and optionally emit call_busy.
- Authorization: ensure authMiddleware used on all REST endpoints.

## Security & rate limiting
- Authenticate all REST calls with existing JWT authMiddleware.
- Rate-limit call requests per user to prevent spam (e.g., 1 call per second).
- Generate short-lived Agora tokens per call; include uid if using RTM/rtc-specific tokens.
- For production multi-instance, store busy state in Redis and use a shared pub/sub to notify sockets across instances.

## Scaling
- Signaling (Socket.IO) horizontally: use Redis adapter for Socket.IO so emits reach correct instance.
- Busy state: store in Redis with TTL to avoid stale locks.
- Agora handles media at scale; ensure token generation is correct and monitor channel naming to avoid collisions.

## Testing steps (quick)
1. Run DB migration to add video_call_sessions table.
2. Add new files: services/callState.js, services/callService.js, controllers/Api/callController.js, routes/api/callRoutes.js, VIDEO_CALL.md
3. Add mount line in routes/api/index.js: const callRoutes = require('./callRoutes'); app.use('/api/call', callRoutes);
4. Restart server.
5. Use two browser windows or chat-client.js to join sockets as two users; initiate POST /api/call/request from caller; observe incoming_call event on callee; accept and verify call_accepted with agora token placeholder.

## Implementation checklist (files to add)
- services/callState.js
- services/callService.js
- controllers/Api/callController.js
- routes/api/callRoutes.js
- migrations/20260807_create_video_call_sessions.sql
- VIDEO_CALL.md (this file)

## Notes & next steps
- मैं generateAgoraToken placeholder छोड़ रहा हूँ — बताओ अगर चाहो तो मैं real Agora token generation code और required package.json और small test harness का पूरा code दे दूँ।
- अगर ठीक है, मैं अब actual file contents (पूर्ण ready-to-paste) देता हूँ जिन्हें आप workspace में जोड़ सकते हो. कौन सा चाहोगे— सिर्फ VIDEO_CALL.md (उपरोक्त) या साथ में सभी server files भी चाहिए?
