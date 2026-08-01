require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret', resave: false, saveUninitialized: false }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Root route – redirect to admin login if not logged in
app.get('/', (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/admin/login');
});

// Import routes
const apiRoutes = require('./routes/api');
// const adminRoutes = require('./routes/admin/dashboardRoutes');

// Mount routes
app.use('/api', apiRoutes);
// app.use('/admin', adminRoutes);

// Socket.io setup
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', ({ userId }) => {
    socket.join(`user_${userId}`);
  });

  socket.on('like', ({ fromId, toId }) => {
    console.log(`like: ${fromId} -> ${toId}`);
    io.to(`user_${toId}`).emit('liked', { fromId, toId });
  });

  socket.on('message', ({ fromId, toId, text }) => {
    console.log(`message from ${fromId} to ${toId}: ${text}`);
    io.to(`user_${toId}`).emit('message', { fromId, toId, text });
  });

  socket.on('disconnect', () => console.log('disconnected', socket.id));
});

const port = 3001;
server.listen(port, () => console.log(`Server listening on ${port}`));