# Blocked User Chat/Call Behavior

## Purpose
This document explains how the backend handles blocked users for chat and call flows, and what the frontend should expect from APIs and socket events.

## Block behavior rules
1. If either user has blocked the other, no chat message should be delivered.
2. If either user has blocked the other, no call request should be allowed.
3. Blocking is mutual for communication blocking logic: if A blocks B or B blocks A, the interaction is blocked.

## Backend files changed
- `controllers/Api/chatController.js`
  - `sendMessage`
  - Returns `403` when a block exists.
- `config/socket.js`
  - `socket.on('chat_message', ...)`
  - Returns callback error when a block exists.
- `controllers/Api/callController.js`
  - `requestCall`
  - Returns `403` when a block exists.
- `utils/blockHelpers.js`
  - Added `isUserBlockedBetween(userA, userB)`.

## APIs and responses

### POST /api/chat/send

Request body:
```json
{
  "roomId": "room_1_2",
  "receiverId": 2,
  "message": "Hello"
}
```

Success response:
```json
{
  "success": true,
  "message": "Message sent",
  "messageId": 123,
  "roomId": "room_1_2",
  "receiverHasPlan": true,
  "delivered": true,
  "payload": { ... }
}
```

Blocked response:
```json
{
  "message": "Message cannot be sent because one user has blocked the other."
}
```

### Socket: `chat_message`

Client emits:
```js
socket.emit('chat_message', {
  roomId: 'room_1_2',
  receiverId: 2,
  message: 'Hello'
}, callback);
```

If blocked, callback receives:
```js
{ success: false, error: 'Cannot send message because one user has blocked the other.' }
```

If success, callback receives:
```js
{ success: true, message: 'Message sent', delivered: true, messageId: 123, roomId: 'room_1_2', receiverHasPlan: true }
```

### POST /api/call/request

Request body:
```json
{
  "calleeId": 2
}
```

Blocked response:
```json
{
  "message": "Call cannot be requested because one user has blocked the other."
}
```

Success response:
```json
{ "success": true, "callId": "call_...", "emitted": true }
```

## Frontend handling recommendations
- For chat send errors, show a user-friendly message and do not retry.
- For call request errors, do not open the call UI and show an error like "Call not allowed.".
- If socket callback returns `success: false`, stop sending the message and show the error.

## Notes
- Blocking checking is performed on both HTTP and socket chat flows.
- The backend helper uses `user_blocks` table.
- No additional frontend state is required, only handle the error responses correctly.
