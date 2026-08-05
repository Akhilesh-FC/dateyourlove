/*
  chat-client.js

  Usage:
    npm install socket.io-client
    node chat-client.js

  This script connects to your Socket.IO server, emits `join`, logs incoming socket events,
  and can send chat messages through your REST API endpoints.
*/

require('dotenv').config();
const readline = require('readline');
const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const USER_ID = process.env.USER_ID || '2';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const socket = io(SERVER_URL, {
  transports: ['websocket'],
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'chat> '
});

function getRoomId(user1Id, user2Id) {
  const first = Number(user1Id);
  const second = Number(user2Id);
  const smaller = Math.min(first, second);
  const larger = Math.max(first, second);
  return `room_${smaller}_${larger}`;
}

function fetchJson(url, options = {}) {
  const headers = options.headers || {};
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return fetch(url, { ...options, headers }).then(async (res) => {
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch (err) {
      return { status: res.status, body: text };
    }
  });
}

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
  socket.emit('join', { userId: USER_ID });
  console.log('Emitted join for userId=', USER_ID);
  rl.prompt();
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

socket.on('connect_error', (err) => {
  console.error('Socket connect error:', err.message || err);
});

socket.on('message', (data) => {
  console.log('\n[SOCKET message] ', data);
  rl.prompt();
});

socket.on('message_status', (data) => {
  console.log('\n[SOCKET message_status] ', data);
  rl.prompt();
});

socket.on('presence', (data) => {
  console.log('\n[SOCKET presence] ', data);
  rl.prompt();
});

function printHelp() {
  console.log(`
Commands:
  help                              Show this help text
  rooms                             GET /api/chat/rooms
  messages <roomId>                 GET /api/chat/messages/:roomId
  send <roomId> <receiverId> <text>  POST /api/chat/send
  send-img <roomId> <receiverId> <imageUrl>  POST /api/chat/send with image_url
  delivered <messageId>             PATCH /api/chat/delivered/:messageId
  seen <messageId>                  PATCH /api/chat/seen/:messageId
  roomid <user1> <user2>            Print the generated room id
  exit                              Quit
`);
}

async function runCommand(line) {
  const parts = line.trim().split(' ');
  const cmd = parts.shift();
  if (!cmd) return;

  switch (cmd) {
    case 'help':
      return printHelp();

    case 'rooms': {
      const url = `${SERVER_URL}/api/chat/rooms`;
      const res = await fetchJson(url, { method: 'GET' });
      console.log(res.status, res.body);
      return;
    }

    case 'messages': {
      const roomId = parts[0];
      if (!roomId) return console.log('Usage: messages <roomId>');
      const url = `${SERVER_URL}/api/chat/messages/${encodeURIComponent(roomId)}`;
      const res = await fetchJson(url, { method: 'GET' });
      console.log(res.status, res.body);
      return;
    }

    case 'send': {
      const [roomId, receiverId, ...textParts] = parts;
      const text = textParts.join(' ');
      if (!roomId || !receiverId || !text) return console.log('Usage: send <roomId> <receiverId> <text>');
      const url = `${SERVER_URL}/api/chat/send`;
      const res = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, receiverId: Number(receiverId), message: text })
      });
      console.log(res.status, res.body);
      return;
    }

    case 'send-img': {
      const [roomId, receiverId, imageUrl] = parts;
      if (!roomId || !receiverId || !imageUrl) return console.log('Usage: send-img <roomId> <receiverId> <imageUrl>');
      const url = `${SERVER_URL}/api/chat/send`;
      const res = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, receiverId: Number(receiverId), image_url: imageUrl })
      });
      console.log(res.status, res.body);
      return;
    }

    case 'delivered': {
      const messageId = parts[0];
      if (!messageId) return console.log('Usage: delivered <messageId>');
      const url = `${SERVER_URL}/api/chat/delivered/${encodeURIComponent(messageId)}`;
      const res = await fetchJson(url, { method: 'PATCH' });
      console.log(res.status, res.body);
      return;
    }

    case 'seen': {
      const messageId = parts[0];
      if (!messageId) return console.log('Usage: seen <messageId>');
      const url = `${SERVER_URL}/api/chat/seen/${encodeURIComponent(messageId)}`;
      const res = await fetchJson(url, { method: 'PATCH' });
      console.log(res.status, res.body);
      return;
    }

    case 'roomid': {
      const [user1, user2] = parts;
      if (!user1 || !user2) return console.log('Usage: roomid <user1> <user2>');
      console.log('generated roomId:', getRoomId(user1, user2));
      return;
    }

    case 'exit':
      console.log('Closing client');
      socket.disconnect();
      rl.close();
      process.exit(0);

    default:
      console.log('Unknown command:', cmd);
      printHelp();
  }
}

rl.on('line', async (line) => {
  await runCommand(line);
  rl.prompt();
});

rl.on('close', () => {
  console.log('Goodbye');
  process.exit(0);
});

printHelp();
rl.prompt();
