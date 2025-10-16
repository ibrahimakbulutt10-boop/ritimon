const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Socket bağlantısı
io.on('connection', (socket) => {
  console.log('🔌 Yeni kullanıcı bağlandı');

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg); // Tüm kullanıcılara gönder
  });

  socket.on('disconnect', () => {
    console.log('❌ Kullanıcı ayrıldı');
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});

