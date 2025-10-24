const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io olayları
io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı');

  socket.on('chatMessage', (msg) => {
    io.emit('chatMessage', msg);
  });

  socket.on('clearChat', () => {
    io.emit('clearChat');
  });

  socket.on('banUser', (username) => {
    io.emit('banUser', username);
  });

  socket.on('userList', (list) => {
    io.emit('userList', list);
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı');
  });
});

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
