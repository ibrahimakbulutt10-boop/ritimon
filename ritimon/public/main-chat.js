// RitimON FM - Main Chat Client (Socket.io)
const socket = io();

// State
let myNickname = localStorage.getItem('chatNickname') || '';
let isDJLoggedIn = false;

// DOM
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const onlineCount = document.getElementById('onlineCount');
const userCount = document.getElementById('userCount');
const userList = document.getElementById('userList');
const currentSongEl = document.getElementById('currentSong');
const currentDJEl = document.getElementById('currentDJ');
const djPanelStatus = document.getElementById('djPanelStatus');
const joinModal = document.getElementById('joinModal');
const userNicknameInput = document.getElementById('userNickname');
const djLoginEl = document.getElementById('djLogin');
const djControlsEl = document.getElementById('djControls');

// Init
document.addEventListener('DOMContentLoaded', () => {
  // Populate status from API
  fetch('/api/status')
    .then(r => r.json())
    .then(s => {
      currentSongEl.textContent = s.currentSong;
      currentDJEl.textContent = s.currentDJ;
      onlineCount.textContent = s.onlineUsers;
      userCount.textContent = s.onlineUsers;
    })
    .catch(() => {});

  // Auto open modal if no nickname
  if (!myNickname) {
    joinModal.style.display = 'flex';
    userNicknameInput.focus();
  } else {
    socket.emit('join', { nickname: myNickname });
  }

  // UI events
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});

// Expose helpers for HTML
window.joinChat = function() {
  const val = (userNicknameInput.value || '').trim();
  if (!val) return;
  myNickname = val;
  localStorage.setItem('chatNickname', myNickname);
  joinModal.style.display = 'none';
  socket.emit('join', { nickname: myNickname });
};

window.addEmoji = function(emoji) {
  messageInput.value += emoji;
  messageInput.focus();
};

window.djLogin = function() {
  const nickname = document.getElementById('djNickname').value.trim();
  const pass = document.getElementById('djPassword').value;
  if (!nickname) return;
  if (pass !== '4545') {
    djPanelStatus.textContent = 'Şifre yanlış';
    djPanelStatus.classList.add('error');
    return;
  }
  isDJLoggedIn = true;
  djLoginEl.style.display = 'none';
  djControlsEl.style.display = 'block';
  socket.emit('dj login', { nickname });
  djPanelStatus.textContent = 'DJ giriş yapıldı';
  djPanelStatus.classList.remove('error');
};

window.djLogout = function() {
  isDJLoggedIn = false;
  djLoginEl.style.display = 'block';
  djControlsEl.style.display = 'none';
  socket.emit('dj logout', { nickname: myNickname });
  djPanelStatus.textContent = 'Giriş yapılmadı';
};

window.startBroadcast = function() {
  document.getElementById('broadcastBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  djPanelStatus.textContent = '🟢 Yayın aktif';
};

window.stopBroadcast = function() {
  document.getElementById('broadcastBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  socket.emit('dj stop');
  djPanelStatus.textContent = '🔴 Yayın kapalı';
};

window.updateSong = function() {
  const name = document.getElementById('songName').value.trim();
  if (!name) return;
  socket.emit('dj play', { song: name });
};

window.sendAnnouncement = function() {
  const text = document.getElementById('announcementText').value.trim();
  if (!text) return;
  socket.emit('dj announcement', { text });
  document.getElementById('announcementText').value = '';
};

window.goToFullDJPanel = function() {
  window.location.href = '/dj';
};

// Socket events
socket.on('userJoined', (user) => {
  addSystem(`👋 ${user.nickname} sohbete katıldı`);
});

socket.on('userLeft', (user) => {
  addSystem(`👋 ${user.nickname} sohbetten ayrıldı`);
});

socket.on('userList', (users) => {
  onlineCount.textContent = users.length;
  userCount.textContent = users.length;
  renderUsers(users);
});

socket.on('chat message', (data) => {
  addMessage(data);
});

socket.on('now playing', (data) => {
  currentSongEl.textContent = data.song;
  currentDJEl.textContent = data.dj;
});

socket.on('stop playing', (data) => {
  currentSongEl.textContent = 'Müzik yükleniyor...';
  currentDJEl.textContent = 'DJ bekleniyor';
});

socket.on('announcement', (data) => {
  addAnnouncement(data.dj, data.text);
});

// Rendering helpers
function addMessage(data) {
  const isOwn = data.nickname === myNickname;
  const wrap = document.createElement('div');
  wrap.className = `message ${isOwn ? 'own' : ''} ${data.isDJ ? 'dj' : ''}`;
  const time = new Date(data.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  wrap.innerHTML = `
    <div class="message-info">
      <strong>${escapeHtml(data.nickname)}</strong> • ${time}
      ${data.isDJ ? '<span class="dj-badge">🎙️ DJ</span>' : ''}
      ${data.warnings > 0 ? `<span class="warning-badge">⚠️ ${data.warnings}</span>` : ''}
    </div>
    <div class="message-content">
      <div class="message-text">${escapeHtml(data.text)}</div>
    </div>
  `;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystem(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message system';
  wrap.innerHTML = `
    <div class="message-content">
      <div class="message-text">${escapeHtml(text)}</div>
    </div>
  `;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAnnouncement(dj, text) {
  const wrap = document.createElement('div');
  wrap.className = 'message announcement';
  wrap.innerHTML = `
    <div class="message-content">
      <div class="message-text">📢 ${escapeHtml(dj)}: ${escapeHtml(text)}</div>
    </div>
  `;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderUsers(users) {
  userList.innerHTML = '';
  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <div class="user-avatar">${escapeHtml(u.nickname.charAt(0).toUpperCase())}</div>
      <div class="user-name">${escapeHtml(u.nickname)}</div>
      <div class="user-status">${u.isOnline ? '🟢' : '🟡'}</div>
    `;
    userList.appendChild(item);
  });
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  const payload = {
    text,
    timestamp: new Date().toISOString()
  };
  socket.emit('chat message', payload);
  // Optimistic UI
  addMessage({ nickname: myNickname || 'Ben', text, timestamp: payload.timestamp, isDJ: false, warnings: 0 });
  messageInput.value = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
