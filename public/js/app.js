const eventsEl = document.getElementById('events');
const log = (t) => { eventsEl.innerHTML += `<div>${t}</div>`; eventsEl.scrollTop = eventsEl.scrollHeight; };

let socket = null;

document.getElementById('connectBtn').addEventListener('click', () => {
  const userId = document.getElementById('userId').value.trim();
  if (!userId) return alert('enter user id');
  socket = io();
  socket.on('connect', () => {
    log('connected: ' + socket.id);
    socket.emit('join', { userId });
  });
  socket.on('liked', (data) => log('You were liked by: ' + data.fromId));
  socket.on('message', (data) => log(`Message from ${data.fromId}: ${data.text}`));
  socket.on('notification', (data) => log(`Notification: ${JSON.stringify(data)}`));
});

document.getElementById('likeBtn').addEventListener('click', () => {
  const fromId = document.getElementById('userId').value.trim();
  const toId = document.getElementById('likeTo').value.trim();
  if (!socket) return alert('connect first');
  socket.emit('like', { fromId, toId });
  log(`Sent like from ${fromId} -> ${toId}`);
});

document.getElementById('msgBtn').addEventListener('click', () => {
  const fromId = document.getElementById('userId').value.trim();
  const toId = document.getElementById('msgTo').value.trim();
  const text = document.getElementById('msgText').value.trim();
  if (!socket) return alert('connect first');
  socket.emit('message', { fromId, toId, text });
  log(`Sent message from ${fromId} -> ${toId}: ${text}`);
});
