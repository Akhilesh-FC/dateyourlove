# Chat API & Socket.IO Documentation

## Overview
Yeh docs mobile frontend team ke liye hain. Backend chat flow mein REST endpoints aur Socket.IO events dono hain.

## Authentication
- Har protected REST request mein send karo:
  - `Authorization: Bearer <token>`
- Socket events mein `join` pe `userId` bhejna zaroori hai.

## Base URLs
- REST API base: `http://localhost:3001/api`
- Socket server: `http://localhost:3001`

> Production mein URL change hoga. Mobile app mein correct host/prod URL use karo.

---

## REST APIs

### 1) Get chat rooms
- Endpoint: `GET /api/chat/rooms`
- Auth: required
- Response:
  - `count`
  - `rooms[]`
    - `roomId`
    - `otherUser`
    - `canReply`
    - `otherUserCanReply`
    - `isOnline`
    - `createdAt`
    - `updatedAt`

### 2) Get messages for a room
- Endpoint: `GET /api/chat/messages/:roomId`
- Auth: required
- Example: `GET /api/chat/messages/room_2_5`
- Query params:
  - `page` (default `1`)
  - `limit` (default `30`)
- Response:
  - `roomId`
  - `page`
  - `limit`
  - `total`
  - `canReply`
  - `messages[]`
    - `id`
    - `room_id`
    - `sender_id`
    - `receiver_id`
    - `message`
    - `image_url`
    - `is_delivered`
    - `is_seen`
    - `created_at`
    - `updated_at`

### 3) Send message (fallback REST)
- Preferred: use Socket.IO `chat_message` event
- Fallback REST endpoint: `POST /api/chat/send`
- Auth: required
- Body:
  - `roomId` (string)
  - `receiverId` (number)
  - `message` (string, optional if image present)
  - `image_url` (string, optional)
- Example payload:
```json
{
  "roomId": "room_2_5",
  "receiverId": 5,
  "message": "Hello from mobile app",
  "image_url": "https://example.com/photo.jpg"
}
```
- Response:
  - `success`
  - `message`
  - `messageId`
  - `roomId`
  - `receiverHasPlan`
  - `delivered`

### 4) Upload chat image
- Endpoint: `POST /api/chat/upload-image`
- Auth: required
- Request type: `multipart/form-data`
- Field name: `image`
- Response:
  - `success`
  - `image_url`
  - `full_url`

### 5) Mark delivered
- Endpoint: `PATCH /api/chat/delivered/:messageId`
- Auth: required
- Example: `PATCH /api/chat/delivered/123`
- Response:
  - `message`: `Delivered updated`

### 6) Mark seen
- Endpoint: `PATCH /api/chat/seen/:messageId`
- Auth: required
- Example: `PATCH /api/chat/seen/123`
- Response:
  - `message`: `Seen updated`

---

## Socket.IO events

### Connect and join
1. Connect to socket server:
   - `const socket = io('http://localhost:3001');`
2. After connect, emit join:
   - `socket.emit('join', { userId: '<currentUserId>' });`

### Events
- `typing`
  - Send payload:
    - `roomId`
    - `receiverId`
    - `isTyping` (true/false)
  - Receiver payload:
    - `roomId`
    - `senderId`
    - `isTyping`
  - Callback response:
    - `success`
    - `message`
    - `roomId`
    - `receiverId`
    - `isTyping`

- `chat_message`
  - Send payload:
    - `roomId`
    - `receiverId`
    - `message` (string, optional if `imageUrl` provided)
    - `imageUrl` (string, optional)
  - Callback response:
    - `success`
    - `message`
    - `messageId`
    - `roomId`
    - `receiverHasPlan`
    - `delivered`

- `message`
  - Fired when backend sends a new incoming chat message
  - Payload contains:
    - `id`
    - `room_id`
    - `sender_id`
    - `receiver_id`
    - `message`
    - `image_url`
    - `is_delivered`
    - `is_seen`
    - `created_at`
    - `updated_at`
    - `roomId`
    - `receiverHasPlan`

- `message_status`
  - Fired when delivered/seen status changes
  - Payload contains:
    - `messageId`
    - `status` (`delivered` or `seen`)
    - `roomId`

- `presence`
  - Fired when a user goes online/offline
  - Payload contains:
    - `userId`
    - `status` (`online` or `offline`)

### Example client usage
```js
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('join', { userId: '2' }, (response) => {
    console.log('join response', response);
  });
});

socket.emit('typing', { roomId: 'room_2_5', receiverId: 5, isTyping: true }, (response) => {
  console.log('typing response', response);
});

socket.emit('chat_message', {
  roomId: 'room_2_5',
  receiverId: 5,
  message: 'Hello from socket',
  imageUrl: null,
}, (response) => {
  console.log('chat_message response', response);
});

socket.on('message', (data) => {
  console.log('incoming message', data);
});

socket.on('message_status', (data) => {
  console.log('message status update', data);
});

socket.on('typing', (data) => {
  console.log('typing update', data);
});

socket.on('presence', (data) => {
  console.log('presence update', data);
});
```

---

## Chat flow summary

1. **Login / auth**
   - mobile app gets JWT token
   - token saved and used in `Authorization` header

2. **Socket connect**
   - connect to `http://localhost:3001`
   - emit `join` with `userId`

3. **Load rooms**
   - call `GET /api/chat/rooms`

4. **Open room**
   - call `GET /api/chat/messages/:roomId`

5. **Send message**
   - preferred: emit `chat_message`
   - fallback: call `POST /api/chat/send`
   - backend stores message and emits `message` to receiver

6. **Delivery**
   - if receiver online, backend updates `is_delivered = 1`
   - sender receives `message_status` with `delivered`

7. **Seen**
   - receiver calls `PATCH /api/chat/seen/:messageId`
   - backend updates `is_seen = 1`
   - sender receives `message_status` with `seen`

---

## Important business rules

- Sender must have active subscription to send messages.
- Receiver must have active subscription to reply and to mark seen/delivered.
- To view chat history, the user must have an active plan.
- Active plan is valid when:
  - `status = 'active'`
  - `start_date <= CURDATE()`
  - `end_date >= CURDATE()`

---

## Notes for frontend team

- Use socket for live chat and typing updates.
- Use REST to fetch rooms, fetch chat history, upload images, and fallback send.
- Keep the socket connected to receive `message`, `message_status`, `typing`, and `presence` events.

---

## Local test commands

Use this file for quick manual testing with `chat-client.js`:
- `roomid 2 5`
- `send room_2_5 5 Hello from user 2`
- `messages room_2_5`
- `seen 123`
- `delivered 123`
