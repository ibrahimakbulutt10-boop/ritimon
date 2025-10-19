const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DISABLE_UPLOADS = true; // Uploadlar devre dışı (istem üzerine)

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded files publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ses dosyaları yüklenebilir!'), false);
    }
  }
});

// Memory storage for app state
let onlineUsers = new Map();
let activeDJs = new Map();
let bannedUsers = new Set();
let mutedUsers = new Map();
let currentSong = 'Müzik yükleniyor...';
let currentDJ = 'DJ bekleniyor';
let isLive = false;
let serverStartTime = Date.now();
// In-memory music library (simple demo storage)
let musicLibrary = [];
let nextMusicId = 1;

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/main-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main-chat.html'));
});

app.get('/chat-room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat-room.html'));
});

app.get('/dj', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dj.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    onlineUsers: onlineUsers.size,
    activeDJs: activeDJs.size,
    currentSong: currentSong,
    currentDJ: currentDJ,
    isLive: isLive,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    musicCount: musicLibrary.length
  });
});

// File upload endpoint
app.post('/api/upload', upload.single('musicFile'), (req, res) => {
  if (DISABLE_UPLOADS) {
    return res.status(403).json({ error: 'Upload devre dışı' });
  }
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    console.log('Dosya yüklendi:', req.file.filename);
    // Add to in-memory library
    const publicPath = `/uploads/${req.file.filename}`;
    const musicInfo = {
      id: nextMusicId++,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadedAt: Date.now(),
      path: publicPath,
      uploadedBy: req.body?.uploadedBy || 'Unknown'
    };
    musicLibrary.push(musicInfo);
    // Notify clients via socket
    io.emit('musicUploaded', musicInfo);
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      musicInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Dosya yükleme hatası' });
  }
});

// Alias endpoint for dj-stream.js expectations
app.post('/api/upload-music', upload.single('musicFile'), (req, res) => {
  if (DISABLE_UPLOADS) {
    return res.status(403).json({ error: 'Upload devre dışı' });
  }
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    const publicPath = `/uploads/${req.file.filename}`;
    const musicInfo = {
      id: nextMusicId++,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadedAt: Date.now(),
      path: publicPath,
      uploadedBy: req.body?.uploadedBy || 'Unknown'
    };
    musicLibrary.push(musicInfo);
    io.emit('musicUploaded', musicInfo);
    res.json({ success: true, musicInfo });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Dosya yükleme hatası' });
  }
});

// Music library endpoints
app.get('/api/music-library', (req, res) => {
  res.json(musicLibrary);
});

app.delete('/api/music/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = musicLibrary.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Bulunamadı' });
  }
  const [removed] = musicLibrary.splice(index, 1);
  // Attempt to delete file from disk (best effort)
  const fileOnDisk = path.join(__dirname, 'uploads', removed.filename);
  fs.unlink(fileOnDisk, (err) => {
    if (err) {
      console.warn('Silme hatası (yoksayılıyor):', err.message);
    }
  });
  io.emit('musicDeleted', { id });
  res.json({ success: true, id });
});

// Users endpoint for clients needing counts
app.get('/api/users', (req, res) => {
  res.json(Array.from(onlineUsers.values()));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);

  // User join
  socket.on('join', (data) => {
    if (bannedUsers.has(data.nickname)) {
      socket.emit('banned', { message: 'Bu odadan yasaklandınız!' });
      return;
    }

    const user = {
      id: socket.id,
      nickname: data.nickname,
      joinTime: new Date().toISOString(),
      isOnline: true,
      isDJ: false,
      warnings: 0
    };

    onlineUsers.set(socket.id, user);
    
    // Notify all users
    io.emit('userJoined', user);
    io.emit('userList', Array.from(onlineUsers.values()));
    
    console.log(`${data.nickname} sohbete katıldı`);
  });

  // Chat message
  socket.on('chat message', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    // Check if user is muted
    if (mutedUsers.has(user.nickname)) {
      const muteInfo = mutedUsers.get(user.nickname);
      if (Date.now() < muteInfo.until) {
        socket.emit('muted', { 
          message: `${Math.ceil((muteInfo.until - Date.now()) / 60000)} dakika daha susturulmusunuz!` 
        });
        return;
      } else {
        mutedUsers.delete(user.nickname);
      }
    }

    const messageData = {
      id: socket.id,
      nickname: user.nickname,
      text: data.text,
      timestamp: data.timestamp,
      isDJ: activeDJs.has(socket.id),
      warnings: user.warnings
    };

    io.emit('chat message', messageData);
    console.log(`[${user.nickname}]: ${data.text}`);
  });

  // DJ login
  socket.on('dj login', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    activeDJs.set(socket.id, {
      nickname: data.nickname,
      loginTime: new Date().toISOString()
    });

    user.isDJ = true;
    onlineUsers.set(socket.id, user);

    io.emit('dj login', { nickname: data.nickname });
    io.emit('userList', Array.from(onlineUsers.values()));
    
    console.log(`${data.nickname} DJ olarak giriş yaptı`);
  });

  // DJ logout
  socket.on('dj logout', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    activeDJs.delete(socket.id);
    user.isDJ = false;
    onlineUsers.set(socket.id, user);

    io.emit('dj logout', { nickname: data.nickname });
    io.emit('userList', Array.from(onlineUsers.values()));
    
    console.log(`${data.nickname} DJ panelinden çıktı`);
  });

  // DJ play song
  socket.on('dj play', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    currentSong = data.song;
    currentDJ = dj.nickname;
    isLive = true;

    io.emit('now playing', {
      song: data.song,
      dj: dj.nickname
    });

    console.log(`${dj.nickname} şarkı değiştirdi: ${data.song}`);
  });

  // DJ stop
  socket.on('dj stop', () => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    currentSong = 'Müzik yükleniyor...';
    currentDJ = 'DJ bekleniyor';
    isLive = false;

    io.emit('stop playing', { dj: dj.nickname });
    console.log(`${dj.nickname} müzik çalmayı durdurdu`);
  });

  // DJ announcement
  socket.on('dj announcement', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    io.emit('announcement', {
      dj: dj.nickname,
      text: data.text,
      timestamp: new Date().toISOString()
    });

    console.log(`${dj.nickname} duyuru yaptı: ${data.text}`);
  });

  // Moderation actions (DJ only)
  socket.on('warnUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    // Find target user
    const targetUser = Array.from(onlineUsers.values()).find(u => u.nickname === data.targetNickname);
    if (targetUser) {
      targetUser.warnings++;
      onlineUsers.set(targetUser.id, targetUser);
      
      io.emit('userWarned', {
        targetNickname: data.targetNickname,
        djNickname: dj.nickname,
        reason: data.reason,
        warnings: targetUser.warnings
      });
    }
  });

  socket.on('muteUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    const muteUntil = Date.now() + (data.duration * 60 * 1000);
    mutedUsers.set(data.targetNickname, {
      until: muteUntil,
      reason: data.reason,
      djNickname: dj.nickname
    });

    io.emit('userMuted', {
      targetNickname: data.targetNickname,
      djNickname: dj.nickname,
      duration: data.duration,
      reason: data.reason
    });
  });

  socket.on('banUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    bannedUsers.add(data.targetNickname);
    
    // Find and disconnect the user
    const targetUser = Array.from(onlineUsers.values()).find(u => u.nickname === data.targetNickname);
    if (targetUser) {
      io.to(targetUser.id).emit('banned', { reason: data.reason });
      io.sockets.sockets.get(targetUser.id)?.disconnect(true);
    }

    io.emit('userBanned', {
      targetNickname: data.targetNickname,
      djNickname: dj.nickname,
      reason: data.reason
    });
  });

  // Typing indicators
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  socket.on('stopTyping', (data) => {
    socket.broadcast.emit('stopTyping', data);
  });

  // User away/back
  socket.on('userAway', (data) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.isOnline = false;
      onlineUsers.set(socket.id, user);
      io.emit('userList', Array.from(onlineUsers.values()));
    }
  });

  socket.on('userBack', (data) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.isOnline = true;
      onlineUsers.set(socket.id, user);
      io.emit('userList', Array.from(onlineUsers.values()));
    }
  });

  // User disconnect
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    
    if (user) {
      // Remove from online users
      onlineUsers.delete(socket.id);
      
      // Remove from active DJs if applicable
      if (activeDJs.has(socket.id)) {
        activeDJs.delete(socket.id);
        io.emit('dj logout', { nickname: user.nickname });
      }
      
      // Notify other users
      io.emit('userLeft', user);
      io.emit('userList', Array.from(onlineUsers.values()));
      
      console.log(`${user.nickname} ayrıldı`);
    }
    
    console.log('Bağlantı kesildi:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🎵 RitimON FM Server çalışıyor: http://localhost:${PORT}`);
  console.log(`🎧 Ana Chat: http://localhost:${PORT}/main-chat`);
  console.log(`🎙️ DJ Panel: http://localhost:${PORT}/dj`);
  console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
});
