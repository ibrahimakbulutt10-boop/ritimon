const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let users = [];

io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);

  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', data);
    if (!users.includes(data.username)) {
      users.push(data.username);
      io.emit('userList', users);
    }
  });

  socket.on('clearChat', () => {
    io.emit('clearChat');
  });

  socket.on('banUser', (username) => {
    users = users.filter(u => u !== username);
    io.emit('userList', users);
    io.emit('chatMessage', {
      username: 'Sistem',
      message: `${username} yayından çıkarıldı 🚫`
    });
  });

  socket.on('disconnect', () => {
    console.log('Bağlantı kesildi:', socket.id);
    // Kullanıcı adıyla eşleştirme yapılmadığı için listeyi temizlemiyoruz
  });
});

server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
