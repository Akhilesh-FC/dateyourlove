require('dotenv').config();
const express = require('express');
const http = require('http');
const { initSocket } = require('./config/socket'); // socket.io initializer
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
const adminRoutes = require('./routes/admin/dashboardRoutes');

// Mount routes
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Socket.io setup
const server = http.createServer(app);
const io = initSocket(server); // initialize socket.io



const port = 3001;
server.listen(port, () => console.log(`Server listening on ${port}`));