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

// ---- In-memory state ----
const socketIdToUsername = new Map();
const usernameToSocketIds = new Map();
const bannedUsernames = new Set();
const djSockets = new Set();
const socketIdToLastTypingMs = new Map();
const socketIdToLastMessageMs = new Map();
const messageHistory = [];
let pinnedMessage = '';

function computeUserList() {
  return Array.from(usernameToSocketIds.keys()).sort();
}

function broadcastUserList() {
  io.emit('userList', { users: computeUserList(), count: usernameToSocketIds.size });
}

function isDJ(socket) {
  return djSockets.has(socket.id);
}

function getDJNames() {
  const names = new Set();
  for (const id of djSockets) {
    const name = socketIdToUsername.get(id) || 'DJ';
    if (name) names.add(name);
  }
  return Array.from(names).sort();
}

function broadcastDJList() {
  const names = getDJNames();
  io.emit('djList', names);
  const onAir = names[0] || null;
  io.emit('onAir', onAir);
}

// Socket.io olayları
io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı');

  // Yeni bağlanan kullanıcılara geçmiş mesajları ve sabit mesajı gönder
  if (messageHistory.length > 0) {
    socket.emit('chatHistory', messageHistory);
  }
  if (pinnedMessage) {
    socket.emit('pinned', pinnedMessage);
  }

  socket.on('setNickname', (nicknameRaw) => {
    const nickname = String(nicknameRaw || '').trim().slice(0, 32) || 'Anonim';
    const prev = socketIdToUsername.get(socket.id);
    if (prev && usernameToSocketIds.has(prev)) {
      const set = usernameToSocketIds.get(prev);
      set.delete(socket.id);
      if (set.size === 0) usernameToSocketIds.delete(prev);
    }
    socketIdToUsername.set(socket.id, nickname);
    if (!usernameToSocketIds.has(nickname)) usernameToSocketIds.set(nickname, new Set());
    usernameToSocketIds.get(nickname).add(socket.id);
    broadcastUserList();
    if (djSockets.has(socket.id)) broadcastDJList();
  });

  socket.on('djLogin', (payload = {}, ack) => {
    const password = String(payload.password || '');
    const expected = process.env.DJ_PASSWORD || '4545';
    const ok = password === expected;
    if (ok) djSockets.add(socket.id);
    if (ok) broadcastDJList();
    if (typeof ack === 'function') ack({ ok });
  });

  socket.on('chatMessage', (msg) => {
    if (!msg || typeof msg.message !== 'string') return;
    const message = msg.message.trim().slice(0, 500);
    const username = (msg.username || socketIdToUsername.get(socket.id) || 'Anonim').slice(0, 32);
    if (!message) return;
    if (bannedUsernames.has(username)) return;
    // Basit hız sınırlama: 500ms'den sık mesajları reddet
    const now = Date.now();
    const last = socketIdToLastMessageMs.get(socket.id) || 0;
    if (now - last < 500) return;
    socketIdToLastMessageMs.set(socket.id, now);
    const payload = { type: 'text', username, message, at: now };
    io.emit('chatMessage', { username, message });
    // Geçmişe ekle
    messageHistory.push(payload);
    if (messageHistory.length > 50) messageHistory.shift();
  });

  socket.on('clearChat', () => {
    if (!isDJ(socket)) return;
    io.emit('clearChat');
  });

  socket.on('chatImage', (payload = {}) => {
    if (!isDJ(socket)) return;
    const username = (socketIdToUsername.get(socket.id) || 'DJ').slice(0, 32);
    if (bannedUsernames.has(username)) return;
    const rawUrl = String(payload.url || '').trim();
    if (!rawUrl || rawUrl.length > 300) return;
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      const lower = u.pathname.toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!allowed.some(ext => lower.endsWith(ext))) return;
      const url = u.toString();
      io.emit('chatImage', { username, url });
      // Geçmişe ekle
      const now = Date.now();
      messageHistory.push({ type: 'image', username, url, at: now });
      if (messageHistory.length > 50) messageHistory.shift();
    } catch (_) {
      return;
    }
  });

  socket.on('banUser', (usernameRaw) => {
    if (!isDJ(socket)) return;
    const username = String(usernameRaw || '').trim();
    if (!username) return;
    bannedUsernames.add(username);
    io.emit('userBanned', username);
  });

  socket.on('dj:announce', (text) => {
    if (!isDJ(socket)) return;
    const message = String(text || '').trim().slice(0, 280);
    if (!message) return;
    const now = Date.now();
    io.emit('announcement', { message, at: now });
    // Geçmişe ekle
    messageHistory.push({ type: 'announcement', message, at: now });
    if (messageHistory.length > 50) messageHistory.shift();
  });

  socket.on('dj:pin', (text = '') => {
    if (!isDJ(socket)) return;
    const next = String(text).trim().slice(0, 280);
    pinnedMessage = next;
    io.emit('pinned', pinnedMessage);
  });

  socket.on('typing', () => {
    const username = (socketIdToUsername.get(socket.id) || 'Anonim').slice(0, 32);
    const now = Date.now();
    const last = socketIdToLastTypingMs.get(socket.id) || 0;
    if (now - last < 1500) return; // Flood koruma
    socketIdToLastTypingMs.set(socket.id, now);
    socket.broadcast.emit('typing', { username, at: now });
  });

  socket.on('disconnect', () => {
    const username = socketIdToUsername.get(socket.id);
    if (username) {
      socketIdToUsername.delete(socket.id);
      const set = usernameToSocketIds.get(username);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) usernameToSocketIds.delete(username);
      }
    }
    djSockets.delete(socket.id);
    console.log('Kullanıcı ayrıldı');
    broadcastUserList();
    broadcastDJList();
  });
});

// 🎶 Şarkı bilgisi çekme fonksiyonu
function fetchCurrentSong(callback) {
  const options = {
    host: '88.150.230.110',
    port: 37836,
    path: '/stream',
    headers: { 'Icy-MetaData': 1 }
  };

  const req = http.get(options, (res) => {
    const icyMetaInt = parseInt(res.headers['icy-metaint']);
    if (!icyMetaInt) { callback(null); res.destroy(); return; }

    let bytesSeen = 0;
    let pendingMetaLen = null;
    let stored = Buffer.alloc(0);

    res.on('data', (chunk) => {
      stored = Buffer.concat([stored, chunk]);
      while (stored.length > 0) {
        if (pendingMetaLen === null) {
          const need = icyMetaInt - bytesSeen;
          if (stored.length < need) {
            bytesSeen += stored.length;
            stored = Buffer.alloc(0);
            break;
          } else {
            // skip audio up to metaint
            stored = stored.slice(need);
            bytesSeen = 0;
            // next byte is metadata length in 16-byte blocks
            if (stored.length === 0) return; // wait next chunk
            pendingMetaLen = stored[0] * 16;
            stored = stored.slice(1);
          }
        }
        if (pendingMetaLen !== null) {
          if (stored.length < pendingMetaLen) {
            // wait more
            break;
          }
          const metaBuf = stored.slice(0, pendingMetaLen);
          stored = stored.slice(pendingMetaLen);
          pendingMetaLen = null;
          const metadata = metaBuf.toString('utf8');
          const match = metadata.match(/StreamTitle='([^']*)';/);
          callback(match ? match[1] : null);
          res.destroy();
          return;
        }
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

// ---- REST endpoints ----
app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/status', (_req, res) => {
  res.json({
    uptimeSec: Math.round(process.uptime()),
    usersOnline: usernameToSocketIds.size,
    djsOnline: djSockets.size,
  });
});

app.get('/api/users', (_req, res) => {
  res.json({ users: computeUserList() });
});

app.get('/api/djs', (_req, res) => {
  res.json({ count: djSockets.size, names: getDJNames() });
});

// ---- Radio proxy ----
app.get('/radio', (req, res) => {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-cache');
  const options = {
    host: '88.150.230.110',
    port: 37836,
    path: '/stream',
    headers: {
      // Disable ICY metadata in audio stream for browsers
      'Icy-MetaData': 0,
      'User-Agent': req.headers['user-agent'] || 'RitimON-FM-Proxy'
    }
  };
  const upstream = http.request(options, (upstreamRes) => {
    // Forward key headers if present
    const contentType = upstreamRes.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    upstreamRes.on('error', () => res.end());
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502);
    res.end();
  });
  upstream.end();
});
