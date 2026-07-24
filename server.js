require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const apiAuth = require('./middleware/apiAuth');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
app.use('/api', apiRoutes);
app.use('/web', webRoutes);

const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', ({ userId }) => {
    socket.join(`user_${userId}`);
  });

  socket.on('like', ({ fromId, toId }) => {
    // DB writes removed from server.js; keep real-time notification
    console.log(`like: ${fromId} -> ${toId}`);
    io.to(`user_${toId}`).emit('liked', { fromId, toId });
  });

  socket.on('message', ({ fromId, toId, text }) => {
    // DB writes removed from server.js; store messages in controllers/models instead
    console.log(`message from ${fromId} to ${toId}: ${text}`);
    io.to(`user_${toId}`).emit('message', { fromId, toId, text });
  });

  socket.on('disconnect', () => console.log('disconnected', socket.id));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on ${port}`));
