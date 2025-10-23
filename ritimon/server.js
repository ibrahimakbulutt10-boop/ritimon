const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Listener and DJ tracking
let listeners = new Set();
let djList = new Set();
let startTime = Date.now();

// API endpoint for status
app.get('/api/status', (req, res) => {
  res.json({
    online: listeners.size,
    activeDJs: Array.from(djList),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

// Socket.io events
io.on('connection', (socket) => {
  let username = null;

  socket.on('joinChat', (name) => {
    username = name || 'Anonim';
    listeners.add(username);
    io.emit('listenerCount', listeners.size);
    io.emit('userList', Array.from(listeners));
  });

  socket.on('chatMessage', (data) => {
    if (username) {
      io.emit('chatMessage', {
        username,
        message: data.message
      });
    }
  });

  socket.on('disconnect', () => {
    if (username) {
      listeners.delete(username);
      djList.delete(username);
      io.emit('listenerCount', listeners.size);
      io.emit('userList', Array.from(listeners));
    }
  });

  socket.on('djLogin', (name) => {
    if (name) {
      djList.add(name);
      io.emit('activeDJs', Array.from(djList));
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ RitimON FM sunucusu ${PORT} portunda çalışıyor`);
});
