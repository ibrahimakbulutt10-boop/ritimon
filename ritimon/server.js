const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let users = [];
let djs = [];

io.on('connection', (socket) => {
  console.log('🔌 Yeni bağlantı:', socket.id);

  socket.on('joinChat', (nickname) => {
    if (!users.includes(nickname)) users.push(nickname);
    if (!djs.includes(nickname)) djs.push(nickname);
    io.emit('userList', users);
    io.emit('activeDJs', djs);
  });

  socket.on('chatMessage', (data) => {
    const nickname = socket.nickname || 'Anonim';
    io.emit('chatMessage', {
      username: nickname,
      message: data.message
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ Bağlantı kapandı:', socket.id);
    // Kullanıcıyı listeden çıkarma (geliştirilebilir)
    // Şu anlık sadece yayını güncelliyoruz
    io.emit('userList', users);
    io.emit('activeDJs', djs);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});
