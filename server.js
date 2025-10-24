const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const socketIo = require('socket.io');
const multer = require('multer');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(os.tmpdir(), 'ritimon-uploads')));

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
const socketIdToLastText = new Map();
const messageHistory = [];
const djVoiceActive = new Set();
let pinnedMessage = '';
let nextMessageId = 1;
const messageIdToReactions = new Map(); // id -> Map(emoji -> count)
const usernameToMeta = new Map(); // username -> { avatarUrl?: string, color?: string }

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
  // Şu anki kullanıcı meta bilgisini gönder
  if (usernameToMeta.size > 0) {
    const meta = {};
    for (const [u, m] of usernameToMeta.entries()) meta[u] = m;
    socket.emit('userMetaInit', meta);
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
    // Aynı metni 5 sn içinde tekrar etmeyi engelle
    const lastText = socketIdToLastText.get(socket.id) || '';
    if (lastText === message && now - last < 5000) return;
    socketIdToLastMessageMs.set(socket.id, now);
    socketIdToLastText.set(socket.id, message);
    const id = nextMessageId++;
    const payload = { id, type: 'text', username, message, at: now };
    io.emit('chatMessage', { id, username, message });
    // Geçmişe ekle
    messageHistory.push(payload);
    if (messageHistory.length > 50) messageHistory.shift();

    // Link önizleme (ilk http/s URL)
    try {
      const urlMatch = message.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        const urlStr = urlMatch[0];
        if (!isPrivateUrl(urlStr)) fetchLinkPreview(urlStr, (preview) => {
          if (preview) io.emit('linkPreview', { id, url: urlStr, ...preview });
        });
      }
    } catch (_) {}
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
      const id = nextMessageId++;
      io.emit('chatImage', { id, username, url });
      // Geçmişe ekle
      const now = Date.now();
      messageHistory.push({ id, type: 'image', username, url, at: now });
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
    const id = nextMessageId++;
    io.emit('announcement', { id, message, at: now });
    // Geçmişe ekle
    messageHistory.push({ id, type: 'announcement', message, at: now });
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

  // DJ push-to-talk: kısa ses kliplerini yayınla
  socket.on('dj:voice', ({ mime, audio } = {}) => {
    if (!isDJ(socket)) return;
    if (typeof mime !== 'string' || !audio) return;
    const okMime = /^(audio\/webm|audio\/ogg|audio\/mpeg|audio\/mp3)$/i.test(mime);
    if (!okMime) return;
    // audio beklenen: Buffer (binary)
    const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
    // 2MB sınır
    if (buf.length > 2 * 1024 * 1024) return;
    io.emit('dj:voice', { mime, audio: buf });
  });

  // Chunked PTT streaming (no duration limit)
  socket.on('dj:voiceStart', ({ mime } = {}) => {
    if (!isDJ(socket)) return;
    if (typeof mime !== 'string') return;
    const okMime = /^(audio\/webm|audio\/ogg)$/i.test(mime);
    if (!okMime) return;
    djVoiceActive.add(socket.id);
    io.emit('dj:voiceStart', { mime });
  });
  socket.on('dj:voiceChunk', ({ mime, audio } = {}) => {
    if (!isDJ(socket)) return;
    if (!djVoiceActive.has(socket.id)) return;
    if (typeof mime !== 'string' || !audio) return;
    const okMime = /^(audio\/webm|audio\/ogg)$/i.test(mime);
    if (!okMime) return;
    const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
    // Per-chunk limit 128KB
    if (buf.length > 128 * 1024) return;
    io.emit('dj:voiceChunk', { mime, audio: buf });
  });
  socket.on('dj:voiceEnd', () => {
    if (!isDJ(socket)) return;
    djVoiceActive.delete(socket.id);
    io.emit('dj:voiceEnd');
  });

  socket.on('setAvatar', (urlRaw = '') => {
    const username = (socketIdToUsername.get(socket.id) || 'Anonim').slice(0, 32);
    try {
      const u = new URL(String(urlRaw).trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      const lower = u.pathname.toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!allowed.some(ext => lower.endsWith(ext))) return;
      const url = u.toString();
      const prev = usernameToMeta.get(username) || {};
      prev.avatarUrl = url;
      usernameToMeta.set(username, prev);
      io.emit('userMeta', { username, avatarUrl: url });
    } catch (_) {}
  });

  socket.on('dj:setColor', ({ username: targetUser, color } = {}) => {
    if (!isDJ(socket)) return;
    const u = String(targetUser || '').trim().slice(0, 32);
    const c = String(color || '').trim();
    if (!u || !/^#?[0-9a-fA-F]{6}$/.test(c)) return;
    const hex = c.startsWith('#') ? c : `#${c}`;
    const prev = usernameToMeta.get(u) || {};
    prev.color = hex;
    usernameToMeta.set(u, prev);
    io.emit('userMeta', { username: u, color: hex });
  });

  socket.on('react', ({ id, emoji } = {}) => {
    if (!id || typeof emoji !== 'string' || !emoji) return;
    const allowed = new Set(['😀','❤️','🔥','👍','👏','🎵']);
    if (!allowed.has(emoji)) return;
    if (!messageIdToReactions.has(id)) messageIdToReactions.set(id, new Map());
    const map = messageIdToReactions.get(id);
    map.set(emoji, (map.get(emoji) || 0) + 1);
    const counts = {};
    for (const [k, v] of map.entries()) counts[k] = v;
    io.emit('reactionUpdate', { id, counts });
  });

  socket.on('dj:deleteMessage', ({ id } = {}) => {
    if (!isDJ(socket) || !id) return;
    // remove from history
    const idx = messageHistory.findIndex(m => m.id === id);
    if (idx >= 0) messageHistory.splice(idx, 1);
    messageIdToReactions.delete(id);
    io.emit('deleteMessage', { id });
  });

  socket.on('dj:deleteByUser', ({ username: target } = {}) => {
    if (!isDJ(socket)) return;
    const u = String(target || '').trim();
    if (!u) return;
    for (let i = messageHistory.length - 1; i >= 0; i--) {
      if (messageHistory[i].username === u) {
        messageIdToReactions.delete(messageHistory[i].id);
        messageHistory.splice(i, 1);
      }
    }
    io.emit('deleteByUser', { username: u });
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

// ---- Stream configuration helpers ----
function getStreamConfig() {
  const url = process.env.STREAM_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        protocol: u.protocol || 'http:',
        host: u.hostname,
        port: u.port ? parseInt(u.port) : (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
      };
    } catch (_) {}
  }
  return {
    protocol: (process.env.STREAM_PROTOCOL || 'http') + ':',
    host: process.env.STREAM_HOST || '88.150.230.110',
    port: parseInt(process.env.STREAM_PORT || '37836'),
    path: process.env.STREAM_PATH || '/stream',
  };
}

function getHttpModule(protocol) {
  return protocol === 'https:' ? https : http;
}

// 🎶 Şarkı bilgisi çekme fonksiyonu
function fetchCurrentSong(callback) {
  const cfg = getStreamConfig();
  const options = {
    host: cfg.host,
    port: cfg.port,
    path: cfg.path,
    headers: { 'Icy-MetaData': 1 }
  };

  const req = getHttpModule(cfg.protocol).get(options, (res) => {
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
  const cfg = getStreamConfig();
  const options = {
    host: cfg.host,
    port: cfg.port,
    path: cfg.path,
    headers: {
      // Disable ICY metadata in audio stream for browsers
      'Icy-MetaData': 0,
      'User-Agent': req.headers['user-agent'] || 'RitimON-FM-Proxy'
    }
  };
  const upstream = getHttpModule(cfg.protocol).request(options, (upstreamRes) => {
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

// ---- DJ upload endpoint (temp storage) ----
const uploadDir = path.join(os.tmpdir(), 'ritimon-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')),
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^audio\/(mpeg|mp3|wav|ogg|aac)$/i.test(file.mimetype);
    cb(ok ? null : new Error('invalid type'), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

app.post('/api/dj/upload', upload.single('audio'), (req, res) => {
  const url = `/uploads/${path.basename(req.file.path)}`;
  return res.json({ ok: true, url });
});

// ---- DJ playback control over sockets ----
io.on('connection', (socket) => {
  // ... existing listeners above remain ...
  socket.on('dj:play', ({ url } = {}) => {
    if (!isDJ(socket)) return;
    if (!url || typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) return;
    io.emit('dj:play', { url });
  });
  socket.on('dj:stop', () => {
    if (!isDJ(socket)) return;
    io.emit('dj:stop');
  });
});
