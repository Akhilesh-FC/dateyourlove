# Chat API & Socket.IO Documentation

## Overview
Yeh docs mobile frontend team ke liye hain. Yeh backend chat flow aur API endpoints describe karta hai: REST endpoints aur Socket.IO events.

## Authentication
- Har protected request mein header bhejno:
  - `Authorization: Bearer <token>`
- JWT token ko mobile app mein safe store karo.
- Example:
  - `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Base URLs
- REST API base: `http://localhost:3001/api`
- Socket server: `http://localhost:3001`

> Note: Production mein yeh url change ho jayega. Jo mobile app use kare, woh correct host/prod URL se replace kare.

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
    - `createdAt`, `updatedAt`

### 2) Get messages for a room
- Endpoint: `GET /api/chat/messages/:roomId`
- Auth: required
- Example: `GET /api/chat/messages/room_2_5`
- Response:
  - `roomId`
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

### 3) Send message
- Preferred: use Socket.IO event `chat_message`
- Fallback: `POST /api/chat/send`
- Auth: required
- Body (REST):
  - `roomId` (string)
  - `receiverId` (number)
  - `message` (string, optional if `image_url` provided)
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
- Use `multipart/form-data` with field name `image`
- Response:
  - `success`
  - `image_url` (relative path)
  - `full_url` (absolute delivered URL)

### 5) Mark delivered
- Endpoint: `PATCH /api/chat/delivered/:messageId`
- Auth: required
- Example: `PATCH /api/chat/delivered/123`
- Response:
  - `message`: `Delivered updated`

### 5) Mark seen
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

### Socket events to use
- `typing`
  - emitter payload:
    - `roomId`
    - `receiverId`
    - `isTyping` (true/false)
  - receiver payload:
    - `roomId`
    - `senderId`
    - `isTyping`
- `chat_message`
  - send payload:
    - `roomId`
    - `receiverId`
    - `message` (string, optional if `imageUrl` provided)
    - `imageUrl` (string, optional)
  - callback response:
    - `success`
    - `message`
    - `messageId`
    - `roomId`
    - `receiverHasPlan`
    - `delivered`
- `message`
  - fired when backend sends a new incoming chat message
  - payload contains:
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
  - fired when delivered/seen status changes
  - payload contains:
    - `messageId`
    - `status` (`delivered` or `seen`)
    - `roomId`
- `presence`
  - fired when a user goes online/offline
  - payload contains:
    - `userId`
    - `status` (`online` or `offline`)

### Example client usage
```js
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('join', { userId: '2' });
});

socket.emit('typing', { roomId: 'room_2_5', receiverId: 5, isTyping: true });

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
   - call `POST /api/chat/send`
   - backend stores message and emits `message` to receiver

6. **Delivery**
   - if receiver online, backend updates `is_delivered = 1`
   - frontend receives `message_status` with `delivered`

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

- `send` uses REST API, not direct socket emit.
- Socket only receives live events.
- If the app wants live message updates, keep socket connected and use `message` event.
- If the app wants to sync older messages, use `GET /api/chat/messages/:roomId`.

---

## Local test commands

Use this file for quick manual testing with `chat-client.js`:
- `roomid 2 5`
- `send room_2_5 5 Hello from user 2`
- `messages room_2_5`
- `seen 123`
- `delivered 123`
