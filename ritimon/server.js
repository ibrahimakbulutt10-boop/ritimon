const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// DJ Playlist Management
let djPlaylists = new Map();
let playHistory = [];
let maxHistorySize = 100;

// Broadcast Management
let isBroadcasting = false;
let currentBroadcastDJ = null;
let broadcastPlaylist = [];
let currentSongIndex = -1;
let ffmpegProcess = null;
let shoutcastConnection = null;

// MyRadioStream.com Server Configuration (Shoutcast)
const SHOUTCAST_CONFIG = {
  host: 's48.myradiostream.com',
  port: 14340,
  password: 's6DV7g2Tx',
  username: 'source',
  genre: 'Various',
  name: 'RitimON FM',
  description: 'RitimON FM - Your Music Station',
  url: 'http://ritimon.on-air.fm',
  bitrate: 128,
  sampleRate: 44100,
  channels: 2
};

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

app.get('/dj-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dj-control.html'));
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
    uptime: Math.floor((Date.now() - serverStartTime) / 1000)
  });
});

app.post('/api/upload', upload.single('musicFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    console.log('Dosya yüklendi:', req.file.filename);
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Dosya yükleme hatası' });
  }
});

app.delete('/api/delete/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Dosya silindi:', filename);
      res.json({ success: true, message: 'Dosya silindi' });
    } else {
      res.status(404).json({ error: 'Dosya bulunamadı' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Dosya silme hatası' });
  }
});

app.get('/api/history', (req, res) => {
  res.json({
    history: playHistory.slice(-50).reverse()
  });
});

app.post('/api/broadcast/start', (req, res) => {
  try {
    const { djName, playlist } = req.body;
    
    if (!djName || !playlist || playlist.length === 0) {
      return res.status(400).json({ error: 'DJ adı ve playlist gerekli' });
    }
    
    if (isBroadcasting) {
      return res.status(400).json({ error: 'Yayın zaten aktif' });
    }
    
    currentBroadcastDJ = djName;
    broadcastPlaylist = playlist;
    currentSongIndex = 0;
    
    startBroadcast();
    
    res.json({ 
      success: true, 
      message: 'Yayın başlatıldı',
      djName: djName,
      songCount: playlist.length
    });
  } catch (error) {
    console.error('Broadcast start error:', error);
    res.status(500).json({ error: 'Yayın başlatma hatası' });
  }
});

app.post('/api/broadcast/stop', (req, res) => {
  try {
    stopBroadcast();
    res.json({ success: true, message: 'Yayın durduruldu' });
  } catch (error) {
    console.error('Broadcast stop error:', error);
    res.status(500).json({ error: 'Yayın durdurma hatası' });
  }
});

app.get('/api/broadcast/status', (req, res) => {
  res.json({
    isBroadcasting: isBroadcasting,
    currentDJ: currentBroadcastDJ,
    songCount: broadcastPlaylist.length,
    currentSongIndex: currentSongIndex,
    currentSong: currentSongIndex >= 0 && currentSongIndex < broadcastPlaylist.length 
      ? broadcastPlaylist[currentSongIndex] 
      : null
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);

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
    io.emit('userJoined', user);
    io.emit('userList', Array.from(onlineUsers.values()));
    
    console.log(`${data.nickname} sohbete katıldı`);
  });

  socket.on('chat message', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

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

  socket.on('song played', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    const historyEntry = {
      song: data.song,
      artist: data.artist || dj.nickname,
      dj: dj.nickname,
      playedAt: new Date().toISOString(),
      filename: data.filename
    };

    playHistory.push(historyEntry);
    
    if (playHistory.length > maxHistorySize) {
      playHistory.shift();
    }

    if (data.autoDelete && data.filename) {
      const filePath = path.join(__dirname, 'uploads', data.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Otomatik silindi: ${data.filename}`);
      }
    }

    io.emit('song played', historyEntry);
    console.log(`${dj.nickname} çaldı: ${data.song} (${data.autoDelete ? 'silindi' : 'saklandı'})`);
  });

  socket.on('delete song', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    if (data.filename) {
      const filePath = path.join(__dirname, 'uploads', data.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        socket.emit('song deleted', { 
          filename: data.filename,
          success: true 
        });
        console.log(`${dj.nickname} şarkı sildi: ${data.filename}`);
      } else {
        socket.emit('song deleted', { 
          filename: data.filename,
          success: false,
          error: 'Dosya bulunamadı' 
        });
      }
    }
  });

  socket.on('dj stop', () => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

    currentSong = 'Müzik yükleniyor...';
    currentDJ = 'DJ bekleniyor';
    isLive = false;

    io.emit('stop playing', { dj: dj.nickname });
    console.log(`${dj.nickname} müzik çalmayı durdurdu`);
  });

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

  socket.on('warnUser', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) return;

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

  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  socket.on('stopTyping', (data) => {
    socket.broadcast.emit('stopTyping', data);
  });

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

  socket.on('start broadcast', (data) => {
    const dj = activeDJs.get(socket.id);
    if (!dj) {
      socket.emit('broadcast error', { message: 'DJ girişi gerekli' });
      return;
    }
    
    if (isBroadcasting) {
      socket.emit('broadcast error', { message: 'Yayın zaten aktif' });
      return;
    }
    
    if (!data.playlist || data.playlist.length === 0) {
      socket.emit('broadcast error', { message: 'Playlist boş' });
      return;
    }
    
    currentBroadcastDJ = dj.nickname;
    broadcastPlaylist = data.playlist;
    currentSongIndex = 0;
    
    startBroadcast();
    
    socket.emit('broadcast started', {
      success: true,
      message: 'Yayın başlatıldı'
    });
    
    console.log(`🎙️ ${dj.nickname} yayını başlattı (${data.playlist.length} şarkı)`);
  });
  
  socket.on('stop broadcast', () => {
    const dj = activeDJs.get(socket.id);
    if (!dj) {
      socket.emit('broadcast error', { message: 'DJ girişi gerekli' });
      return;
    }
    
    if (!isBroadcasting) {
      socket.emit('broadcast error', { message: 'Yayın zaten kapalı' });
      return;
    }
    
    stopBroadcast();
    
    socket.emit('broadcast stopped', {
      success: true,
      message: 'Yayın durduruldu'
    });
    
    console.log(`🛑 ${dj.nickname} yayını durdurdu`);
  });
  
  socket.on('skip song', () => {
    const dj = activeDJs.get(socket.id);
    if (!dj || !isBroadcasting) return;
    
    console.log(`⏭️ ${dj.nickname} şarkıyı geçti`);
    
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGKILL');
    }
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    
    if (user) {
      onlineUsers.delete(socket.id);
      
      if (activeDJs.has(socket.id)) {
        activeDJs.delete(socket.id);
        io.emit('dj logout', { nickname: user.nickname });
      }
      
      io.emit('userLeft', user);
      io.emit('userList', Array.from(onlineUsers.values()));
      
      console.log(`${user.nickname} ayrıldı`);
    }
    
    console.log('Bağlantı kesildi:', socket.id);
  });
});

// Broadcast Functions
function startBroadcast() {
  if (isBroadcasting) {
    console.log('⚠️ Yayın zaten aktif');
    return;
  }
  
  isBroadcasting = true;
  console.log(`🎙️ Yayın başlatılıyor - DJ: ${currentBroadcastDJ}`);
  
  io.emit('broadcast started', {
    dj: currentBroadcastDJ,
    songCount: broadcastPlaylist.length
  });
  
  playNextSong();
}

function stopBroadcast() {
  if (!isBroadcasting) {
    console.log('⚠️ Yayın zaten kapalı');
    return;
  }
  
  console.log('🛑 Yayın durduruluyor...');
  
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGKILL');
    ffmpegProcess = null;
  }
  
  if (shoutcastConnection) {
    shoutcastConnection.end();
    shoutcastConnection = null;
  }
  
  isBroadcasting = false;
  currentBroadcastDJ = null;
  broadcastPlaylist = [];
  currentSongIndex = -1;
  
  io.emit('broadcast stopped', {});
  
  console.log('✅ Yayın durduruldu');
}

function playNextSong() {
  if (!isBroadcasting || broadcastPlaylist.length === 0) {
    console.log('⚠️ Playlist boş veya yayın kapalı');
    stopBroadcast();
    return;
  }
  
  if (currentSongIndex >= broadcastPlaylist.length) {
    currentSongIndex = 0;
  }
  
  const song = broadcastPlaylist[currentSongIndex];
  const songPath = path.join(__dirname, 'uploads', song.filename);
  
  if (!fs.existsSync(songPath)) {
    console.error(`❌ Dosya bulunamadı: ${song.filename}`);
    currentSongIndex++;
    playNextSong();
    return;
  }
  
  console.log(`🎵 Çalıyor: ${song.title} (${currentSongIndex + 1}/${broadcastPlaylist.length})`);
  
  io.emit('now playing', {
    song: song.title,
    artist: song.artist || currentBroadcastDJ,
    dj: currentBroadcastDJ,
    index: currentSongIndex,
    total: broadcastPlaylist.length
  });
  
  streamToShoutcast(songPath, song);
}

function streamToShoutcast(filePath, song) {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGKILL');
  }
  
  if (shoutcastConnection) {
    shoutcastConnection.end();
  }
  
  // FFmpeg pipe mode - output MP3 to stdout
  const ffmpegArgs = [
    '-re',
    '-i', filePath,
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-f', 'mp3',
    '-'
  ];
  
  console.log('🎧 FFmpeg başlatılıyor (TCP Pipe Mode):', ffmpegArgs.join(' '));
  
  ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
  
  // Create TCP connection to Shoutcast server
  shoutcastConnection = net.connect(SHOUTCAST_CONFIG.port, SHOUTCAST_CONFIG.host, () => {
    console.log('📡 Shoutcast sunucusuna bağlanıldı!');
    
    // Send Shoutcast V1 password
    const authHeader = `${SHOUTCAST_CONFIG.password}\r\n`;
    shoutcastConnection.write(authHeader);
  });
  
  // Pipe FFmpeg output to Shoutcast connection
  ffmpegProcess.stdout.pipe(shoutcastConnection);
  
  ffmpegProcess.stderr.on('data', (data) => {
    console.log('📡 FFmpeg:', data.toString().trim());
  });
  
  shoutcastConnection.on('data', (data) => {
    console.log('📡 Shoutcast:', data.toString().trim());
  });
  
  shoutcastConnection.on('error', (err) => {
    console.error('❌ Shoutcast bağlantı hatası:', err.message);
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGKILL');
    }
  });
  
  shoutcastConnection.on('end', () => {
    console.log('📡 Shoutcast bağlantısı kapandı');
  });
  
  ffmpegProcess.on('close', (code) => {
    console.log(`✅ Şarkı bitti: ${song.title} (exit code: ${code})`);
    
    if (shoutcastConnection) {
      shoutcastConnection.end();
      shoutcastConnection = null;
    }
    
    if (code !== 0) {
      console.error(`❌ FFmpeg başarısız oldu (exit code: ${code})`);
      stopBroadcast();
      io.emit('broadcast error', { 
        message: 'Yayın sunucusuna bağlanılamadı!' 
      });
      return;
    }
    
    const historyEntry = {
      song: song.title,
      artist: song.artist || currentBroadcastDJ,
      dj: currentBroadcastDJ,
      playedAt: new Date().toISOString(),
      filename: song.filename
    };
    
    playHistory.push(historyEntry);
    if (playHistory.length > maxHistorySize) {
      playHistory.shift();
    }
    
    io.emit('song played', historyEntry);
    
    if (song.autoDelete) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Otomatik silindi: ${song.filename}`);
      } catch (err) {
        console.error('Silme hatası:', err);
      }
    }
    
    currentSongIndex++;
    
    if (isBroadcasting) {
      setTimeout(() => playNextSong(), 1000);
    }
  });
  
  ffmpegProcess.on('error', (error) => {
    console.error('❌ FFmpeg error:', error);
    currentSongIndex++;
    if (isBroadcasting) {
      setTimeout(() => playNextSong(), 2000);
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🎵 RitimON FM Server çalışıyor: http://localhost:${PORT}`);
  console.log(`🎧 Ana Chat: http://localhost:${PORT}/main-chat`);
  console.log(`🎙️ DJ Panel: http://localhost:${PORT}/dj`);
  console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
  console.log(`📡 Broadcast Ready: ${SHOUTCAST_CONFIG.host}:${SHOUTCAST_CONFIG.port}`);
});
