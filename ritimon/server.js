const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Database = require('./database');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const db = new Database();

// Session configuration
app.use(session({
  secret: 'ritimon-fm-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Store active users and radio status
let activeUsers = new Map();
let radioStatus = {
  isLive: false,
  currentSong: 'RitimON FM - Yayın Dışı',
  djName: '',
  listeners: 0,
  volume: 50
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/main-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main-chat.html'));
});

app.get('/dj', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dj.html'));
});

// User authentication
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await db.getUserByUsername(username);
    
    if (!user) {
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await db.createUser({
        id: uuidv4(),
        username,
        password: hashedPassword,
        role: 'user',
        color: getRandomColor()
      });
      
      req.session.user = newUser;
      res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role, color: newUser.color } });
    } else {
      // Verify existing user
      const validPassword = await bcrypt.compare(password, user.password);
      if (validPassword) {
        req.session.user = user;
        res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, color: user.color } });
      } else {
        res.json({ success: false, message: 'Yanlış şifre!' });
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: 'Giriş sırasında hata oluştu!' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Kullanıcı bağlandı:', socket.id);

  socket.on('user-join', (userData) => {
    activeUsers.set(socket.id, {
      id: userData.id,
      username: userData.username,
      role: userData.role,
      color: userData.color,
      joinTime: new Date()
    });
    
    // Update listeners count
    radioStatus.listeners = activeUsers.size;
    
    // Notify all users
    io.emit('user-list', Array.from(activeUsers.values()));
    io.emit('radio-status', radioStatus);
    
    // Send welcome message
    io.emit('chat-message', {
      id: uuidv4(),
      username: 'Sistem',
      message: `${userData.username} odaya katıldı! 🎵`,
      timestamp: new Date(),
      type: 'system'
    });
  });

  socket.on('chat-message', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    
    const message = {
      id: uuidv4(),
      username: user.username,
      message: data.message,
      timestamp: new Date(),
      color: user.color,
      role: user.role,
      type: 'user'
    };
    
    // Save to database
    db.saveMessage(message);
    
    // Broadcast message
    io.emit('chat-message', message);
  });

  // DJ Controls
  socket.on('dj-control', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user || (user.role !== 'dj' && user.role !== 'admin')) return;
    
    switch (data.action) {
      case 'start-broadcast':
        radioStatus.isLive = true;
        radioStatus.djName = user.username;
        radioStatus.currentSong = data.songTitle || 'Canlı Yayın';
        break;
        
      case 'stop-broadcast':
        radioStatus.isLive = false;
        radioStatus.djName = '';
        radioStatus.currentSong = 'RitimON FM - Yayın Dışı';
        break;
        
      case 'change-song':
        if (radioStatus.isLive) {
          radioStatus.currentSong = data.songTitle;
        }
        break;
        
      case 'set-volume':
        radioStatus.volume = data.volume;
        break;
    }
    
    io.emit('radio-status', radioStatus);
    
    // Broadcast DJ action
    io.emit('chat-message', {
      id: uuidv4(),
      username: 'DJ Sistemi',
      message: getDJActionMessage(data.action, user.username, data),
      timestamp: new Date(),
      type: 'dj-action'
    });
  });

  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      activeUsers.delete(socket.id);
      radioStatus.listeners = activeUsers.size;
      
      io.emit('user-list', Array.from(activeUsers.values()));
      io.emit('radio-status', radioStatus);
      
      io.emit('chat-message', {
        id: uuidv4(),
        username: 'Sistem',
        message: `${user.username} odadan ayrıldı! 👋`,
        timestamp: new Date(),
        type: 'system'
      });
    }
    
    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

// Helper functions
function getRandomColor() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getDJActionMessage(action, djName, data) {
  switch (action) {
    case 'start-broadcast':
      return `🎙️ ${djName} yayına başladı! Şarkı: ${data.songTitle || 'Canlı Yayın'}`;
    case 'stop-broadcast':
      return `📻 ${djName} yayını sonlandırdı!`;
    case 'change-song':
      return `🎵 Şu anda çalan: ${data.songTitle}`;
    default:
      return `${djName} bir DJ kontrolü gerçekleştirdi.`;
  }
}

// Initialize database
db.init().then(() => {
  server.listen(PORT, () => {
    console.log(`🎵 RitimON FM Server çalışıyor: http://localhost:${PORT}`);
    console.log(`🎧 DJ Paneli: http://localhost:${PORT}/dj`);
  });
}).catch(error => {
  console.error('Database initialization failed:', error);
});
