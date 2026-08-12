## Notification suppression: backend change

What I changed (backend)
- File modified: `config/socket.js`
- Added `canonicalizeRoomId(roomId)` to normalize different room id formats to `room_<smallerId>_<largerId>`.
- Active-room tracking now stores canonical room ids; debug logs added when adding/removing active rooms.
- Message suppression logic updated so a push/FCM notification is skipped only when BOTH sender and receiver are active in the same canonical room.

Why this helps
- Avoids mismatches where client sends different room id variants (e.g., `1_2`, `room_1_2`, or `room:1-2`).
- Makes suppression deterministic: both users must be viewing the same canonical room to suppress notifications.

Frontend impact
- If your frontend already emits these socket events, no code change is strictly required:
  - `join` (on connect)
  - `active_room` (when opening a chat)
  - `clear_active_room` (when leaving or backgrounding)
- However, to be robust and avoid mismatches, it's recommended (but optional) that the client emit the canonical room id format `room_<smallerId>_<largerId>`.

Recommended client snippets (optional)
```javascript
function makeRoomId(a, b) {
  const ai = Number(a);
  const bi = Number(b);
  const small = Math.min(ai, bi);
  const big = Math.max(ai, bi);
  return `room_${small}_${big}`;
}

// On socket connect
socket.emit('join', { userId: String(MY_USER_ID) });

// When opening chat with otherUserId
const roomId = makeRoomId(MY_USER_ID, otherUserId);
socket.emit('active_room', roomId);

// When leaving chat or app in background
socket.emit('clear_active_room');
```

Server logs
- The server now outputs debug lines when active rooms are added/removed, e.g.:
  - `ADD ACTIVE ROOM: user=123 room=room_12_123 activeRooms=[...]`
  - `REMOVE ACTIVE ROOM: ...`

If you want me to also update the frontend files (optional), I can prepare a small patch. For now the backend change is complete — test by opening chat on both devices and sending a message; notifications should be suppressed only when both are viewing the same chat.
