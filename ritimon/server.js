const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.static('public'));
app.use(express.json());

const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Geçici dosya yükleme için multer yapılandırması
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = 'public/temp/music';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Geçici dosya adı - çalındıktan sonra silinecek
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Sadece ses dosyalarına izin ver
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ses dosyaları yüklenebilir!'));
    }
  }
});

// Geçici müzik kütüphanesi - şarkı çalındıktan sonra silinecek
let tempMusicLibrary = [];
let currentlyPlaying = null;

// Store online users
const onlineUsers = new Map();
const activeDJs = new Map();
const bannedUsers = new Set();
const mutedUsers = new Map(); // userId -> timeout timestamp
const userWarnings = new Map(); // userId -> warning count

// Routes
app.get('/api/users', (req, res) => {
  res.json(Array.from(onlineUsers.values()));
});

app.get('/api/djs', (req, res) => {
  res.json(Array.from(activeDJs.values()));
});

app.get('/api/status', (req, res) => {
  res.json({
    onlineUsers: onlineUsers.size,
    activeDJs: activeDJs.size,
    uptime: process.uptime()
  });
});

// Geçici müzik dosyası yükleme endpoint'i
app.post('/api/upload-music', upload.single('musicFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya seçilmedi' });
    }

    const musicInfo = {
      id: Date.now(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/temp/music/${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.body.uploadedBy || 'Unknown',
      isTemporary: true,
      autoDeleteAfter: Date.now() + (30 * 60 * 1000) // 30 dakika sonra otomatik sil
    };

    // Geçici müzik kütüphanesine ekle
    tempMusicLibrary.push(musicInfo);

    // Tüm kullanıcılara yeni müzik eklendiğini bildir
    io.emit('musicUploaded', musicInfo);

    res.json({
      success: true,
      message: 'Müzik dosyası geçici olarak yüklendi (çalındıktan sonra silinecek)',
      musicInfo: musicInfo
    });

    console.log(`Geçici müzik dosyası yüklendi: ${req.file.originalname}`);
    
    // 30 dakika sonra otomatik silme
    setTimeout(() => {
      deleteTempMusic(musicInfo.id);
    }, 30 * 60 * 1000);
    
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    res.status(500).json({ error: 'Dosya yüklenirken hata oluştu' });
  }
});

// Geçici müzik kütüphanesini getir
app.get('/api/music-library', (req, res) => {
  res.json(tempMusicLibrary);
});

// Geçici müzik dosyasını sil
app.delete('/api/music/:id', (req, res) => {
  try {
    const musicId = parseInt(req.params.id);
    deleteTempMusic(musicId);
    res.json({ success: true, message: 'Müzik dosyası silindi' });
  } catch (error) {
    console.error('Dosya silme hatası:', error);
    res.status(500).json({ error: 'Dosya silinirken hata oluştu' });
  }
});

// Geçici müzik dosyasını silme fonksiyonu
function deleteTempMusic(musicId) {
  const musicIndex = tempMusicLibrary.findIndex(music => music.id === musicId);
  
  if (musicIndex !== -1) {
    const music = tempMusicLibrary[musicIndex];
    const filePath = path.join(__dirname, 'public', music.path);

    // Dosyayı sil
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Geçici müzik dosyası silindi: ${music.originalName}`);
    }

    // Kütüphaneden kaldır
    tempMusicLibrary.splice(musicIndex, 1);
    
    // Tüm kullanıcılara dosyanın silindiğini bildir
    io.emit('musicDeleted', { id: musicId });
  }
}

// Hata yakalama middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Dosya boyutu çok büyük (Max: 50MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});

io.on('connection', (socket) => {
  console.log(`Kullanıcı bağlandı: ${socket.id}`);

  // User joins
  socket.on('join', (data) => {
    const { nickname } = data;
    if (!nickname || nickname.trim() === '') return;
    
    // Check if user is banned
    if (bannedUsers.has(nickname.trim())) {
      socket.emit('banned', { message: 'Bu kullanıcı adı yasaklanmış!' });
      return;
    }
    
    // Check if nickname is already taken
    const existingUser = Array.from(onlineUsers.values()).find(user => user.nickname === nickname);
    if (existingUser) {
      socket.emit('nicknameTaken', { message: 'Bu kullanıcı adı zaten alınmış!' });
      return;
    }
    
    const user = {
      id: socket.id,
      nickname: nickname.trim(),
      joinTime: new Date().toISOString(),
      isOnline: true,
      isMuted: mutedUsers.has(nickname.trim()) && mutedUsers.get(nickname.trim()) > Date.now(),
      warnings: userWarnings.get(nickname.trim()) || 0
    };
    
    onlineUsers.set(socket.id, user);
    
    // Broadcast to all users
    socket.broadcast.emit('userJoined', { nickname: user.nickname });
    socket.emit('joined', user);
    
    // Send current online users to the new user
    socket.emit('userList', Array.from(onlineUsers.values()));
    
    console.log(`${user.nickname} sohbete katıldı. Toplam: ${onlineUsers.size}`);
  });

  // Chat message
  socket.on('chat message', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    // Check if user is muted
    if (user.isMuted || (mutedUsers.has(user.nickname) && mutedUsers.get(user.nickname) > Date.now())) {
      socket.emit('muted', { message: 'Mesaj gönderme yetkiniz yok!' });
      return;
    }
    
    const messageData = {
      nickname: user.nickname,
      text: data.text,
      timestamp: new Date().toISOString(),
      id: socket.id,
      isDJ: activeDJs.has(socket.id),
      warnings: user.warnings
    };
    
    io.emit('chat message', messageData);
    console.log(`${user.nickname}: ${data.text}`);
  });

  // DJ Events
  socket.on('dj login', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    const dj = {
      id: socket.id,
      nickname: user.nickname,
      loginTime: new Date().toISOString(),
      isActive: true
    };
    
    activeDJs.set(socket.id, dj);
    io.emit('activeDJ', { nickname: user.nickname });
    io.emit('chat message', {
      nickname: 'Sistem',
      text: `🎙️ ${user.nickname} DJ olarak yayına başladı!`,
      timestamp: new Date().toISOString(),
      type: 'system'
    });
    
    console.log(`DJ ${user.nickname} yayına başladı`);
  });

  socket.on('dj play', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    // Önceki şarkıyı durdur ve sil
    if (currentlyPlaying && currentlyPlaying.isTemporary) {
      deleteTempMusic(currentlyPlaying.id);
    }
    
    // Yeni şarkıyı çal
    const playData = {
      dj: dj.nickname,
      song: data.song,
      timestamp: new Date().toISOString(),
      musicId: data.musicId || null
    };
    
    // Eğer müzik ID'si varsa, çalan şarkıyı kaydet
    if (data.musicId) {
      const music = tempMusicLibrary.find(m => m.id === data.musicId);
      if (music) {
        currentlyPlaying = music;
        // 5 dakika sonra otomatik sil (şarkı çalma süresi)
        setTimeout(() => {
          if (currentlyPlaying && currentlyPlaying.id === data.musicId) {
            deleteTempMusic(data.musicId);
            currentlyPlaying = null;
          }
        }, 5 * 60 * 1000); // 5 dakika
      }
    }
    
    io.emit('now playing', playData);
    console.log(`DJ ${dj.nickname}: "${data.song}" çalıyor`);
  });

  socket.on('dj stop', () => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    // Çalan şarkıyı durdur ve sil
    if (currentlyPlaying && currentlyPlaying.isTemporary) {
      deleteTempMusic(currentlyPlaying.id);
      currentlyPlaying = null;
    }
    
    activeDJs.delete(socket.id);
    io.emit('stop playing', { nickname: dj.nickname });
    io.emit('chat message', {
      nickname: 'Sistem',
      text: `🎙️ DJ ${dj.nickname} yayını durdurdu`,
      timestamp: new Date().toISOString(),
      type: 'system'
    });
    
    console.log(`DJ ${dj.nickname} yayını durdurdu`);
  });

  socket.on('dj announcement', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    const announcementData = {
      dj: dj.nickname,
      text: data.text,
      timestamp: new Date().toISOString()
    };
    
    io.emit('announcement', announcementData);
    console.log(`DJ ${dj.nickname} duyuru yaptı: ${data.text}`);
  });

  // Moderation Events
  socket.on('warnUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    const targetUser = Array.from(onlineUsers.values()).find(user => user.nickname === data.targetNickname);
    if (!targetUser) return;
    
    const warnings = userWarnings.get(data.targetNickname) || 0;
    userWarnings.set(data.targetNickname, warnings + 1);
    
    // Update user object
    const user = onlineUsers.get(targetUser.id);
    if (user) {
      user.warnings = warnings + 1;
    }
    
    io.emit('userWarned', {
      targetNickname: data.targetNickname,
      warnedBy: dj.nickname,
      warningCount: warnings + 1,
      reason: data.reason || 'Kurallara uygun davranmayın'
    });
    
    console.log(`DJ ${dj.nickname} warned ${data.targetNickname}`);
  });

  socket.on('muteUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    const duration = data.duration || 5; // 5 dakika default
    const muteUntil = Date.now() + (duration * 60 * 1000);
    mutedUsers.set(data.targetNickname, muteUntil);
    
    const targetUser = Array.from(onlineUsers.values()).find(user => user.nickname === data.targetNickname);
    if (targetUser) {
      const user = onlineUsers.get(targetUser.id);
      if (user) {
        user.isMuted = true;
      }
    }
    
    io.emit('userMuted', {
      targetNickname: data.targetNickname,
      mutedBy: dj.nickname,
      duration: duration,
      reason: data.reason || 'Kurallara uygun davranmayın'
    });
    
    console.log(`DJ ${dj.nickname} muted ${data.targetNickname} for ${duration} minutes`);
  });

  socket.on('banUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;
    
    bannedUsers.add(data.targetNickname);
    
    const targetUser = Array.from(onlineUsers.values()).find(user => user.nickname === data.targetNickname);
    if (targetUser) {
      onlineUsers.delete(targetUser.id);
      socket.to(targetUser.id).emit('banned', { message: 'Hesabınız yasaklandı!' });
      socket.to(targetUser.id).disconnect();
    }
    
    io.emit('userBanned', {
      targetNickname: data.targetNickname,
      bannedBy: dj.nickname,
      reason: data.reason || 'Kurallara uygun davranmayın'
    });
    
    console.log(`DJ ${dj.nickname} banned ${data.targetNickname}`);
  });

  // User status
  socket.on('userAway', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.isOnline = false;
      socket.broadcast.emit('userStatus', { nickname: user.nickname, status: 'away' });
    }
  });

  socket.on('userBack', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.isOnline = true;
      socket.broadcast.emit('userStatus', { nickname: user.nickname, status: 'online' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    const dj = activeDJs.get(socket.id);
    
    if (user) {
      onlineUsers.delete(socket.id);
      socket.broadcast.emit('userLeft', { nickname: user.nickname });
      console.log(`${user.nickname} sohbeti terk etti`);
    }
    
    if (dj) {
      activeDJs.delete(socket.id);
      socket.broadcast.emit('stop playing', { nickname: dj.nickname });
      console.log(`DJ ${dj.nickname} yayını sonlandı`);
    }
    
    console.log(`Kullanıcı ayrıldı: ${socket.id}. Toplam: ${onlineUsers.size}`);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    users: onlineUsers.size,
    djs: activeDJs.size
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🎧 RitimON FM Sunucusu çalışıyor: http://localhost:${PORT}`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET /api/users - Çevrimiçi kullanıcılar`);
  console.log(`   GET /api/djs - Aktif DJ'ler`);
  console.log(`   GET /api/status - Sunucu durumu`);
  console.log(`   GET /health - Sağlık kontrolü`);
});

