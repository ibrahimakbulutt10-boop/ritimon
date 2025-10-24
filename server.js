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

// 🎶 Şarkı bilgisi çekme fonksiyonu
function fetchCurrentSong(callback) {
  const options = {
    host: '88.150.230.110',
    port: 37836,
    path: '/stream',
    headers: {
      'Icy-MetaData': 1
    }
  };

  const req = http.get(options, (res) => {
    const icyMetaInt = parseInt(res.headers['icy-metaint']);
    if (!icyMetaInt) return callback(null);

    let data = Buffer.alloc(0);
    res.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length >= icyMetaInt + 255) {
        const metadata = data.slice(icyMetaInt, icyMetaInt + 255).toString();
        const match = metadata.match(/StreamTitle='([^']*)';/);
        if (match) {
          callback(match[1]);
        } else {
          callback(null);
        }
        res.destroy();
      }
    });
  });

  req.on('error', () => callback(null));
}

// 🔁 Her 10 saniyede bir şarkıyı çek
setInterval(() => {
  fetchCurrentSong((song) => {
    if (song) {
      console.log("Şu an çalan:", song);
      io.emit('currentSong', song); // Socket.io ile gönder
    }
  });
}, 10000);

// Sunucuyu başlat
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
