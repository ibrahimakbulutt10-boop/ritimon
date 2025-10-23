const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);

// ✅ CORS ayarları güncellendi
const io = socketIo(server, {
  cors: {
    origin: "*", // Tüm origin'lere izin (production'da spesifik domain kullanın)
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const STREAM_URL = 'https://newl2mr.listen2myradio.com';
const METADATA_URL = 'https://newl2mr.listen2myradio.com/7.html';
const HISTORY_FILE = path.join(__dirname, 'song_history.json');

// ✅ Express CORS Middleware eklendi
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Project-Id, X-Encrypted-Yw-ID, X-Is-Login, X-Yw-Env');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.static('public'));

let currentSong = { title: 'Yükleniyor...', artist: 'RitimON FM', artwork: '' };
let listeners = 0;
let songHistory = [];
let users = new Map();

// Şarkı geçmişini yükle
function loadSongHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      songHistory = JSON.parse(data);
    }
  } catch (error) {
    console.error('Şarkı geçmişi yüklenirken hata:', error);
    songHistory = [];
  }
}

// Şarkı geçmişini kaydet
function saveSongHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(songHistory, null, 2));
  } catch (error) {
    console.error('Şarkı geçmişi kaydedilirken hata:', error);
  }
}

// Metadata'yı çek
async function fetchMetadata() {
  try {
    const response = await axios.get(METADATA_URL, { timeout: 5000 });
    const metadata = response.data;
    
    if (metadata && metadata !== currentSong.title) {
      const parts = metadata.split(' - ');
      const newSong = {
        title: parts[1] || metadata,
        artist: parts[0] || 'RitimON FM',
        artwork: '',
        timestamp: new Date().toISOString()
      };
      
      if (newSong.title !== currentSong.title) {
        currentSong = newSong;
        songHistory.unshift(newSong);
        if (songHistory.length > 50) songHistory = songHistory.slice(0, 50);
        saveSongHistory();
        io.emit('nowPlaying', currentSong);
      }
    }
  } catch (error) {
    console.error('Metadata çekilirken hata:', error.message);
  }
}

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    nowPlaying: currentSong,
    listeners,
    streamUrl: STREAM_URL
  });
});

app.get('/api/history', (req, res) => {
  res.json(songHistory.slice(0, 20));
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);
  listeners++;
  io.emit('listenerCount', listeners);

  socket.emit('nowPlaying', currentSong);
  socket.emit('songHistory', songHistory.slice(0, 10));

  socket.on('joinChat', (username) => {
    users.set(socket.id, username);
    io.emit('userList', Array.from(users.values()));
    io.emit('chatMessage', {
      username: 'Sistem',
      message: `${username} sohbete katıldı`,
      timestamp: new Date().toISOString(),
      isSystem: true
    });
  });

  socket.on('chatMessage', (data) => {
    const username = users.get(socket.id);
    if (username) {
      io.emit('chatMessage', {
        username,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('typing', (isTyping) => {
    const username = users.get(socket.id);
    if (username) {
      socket.broadcast.emit('userTyping', { username, isTyping });
    }
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    const username = users.get(socket.id);
    users.delete(socket.id);
    listeners--;
    io.emit('listenerCount', listeners);
    io.emit('userList', Array.from(users.values()));
    
    if (username) {
      io.emit('chatMessage', {
        username: 'Sistem',
        message: `${username} sohbetten ayrıldı`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });
    }
  });
});

// Metadata'yı düzenli olarak güncelle
loadSongHistory();
fetchMetadata();
setInterval(fetchMetadata, 10000);

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  console.log(`Stream URL: ${STREAM_URL}`);
});

