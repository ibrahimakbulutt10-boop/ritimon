// DJ Stream JavaScript - Enhanced with Socket.io
const socket = io();
let isDJLoggedIn = false;
let djNickname = '';
let isStreaming = false;
let uploadedFiles = [];
let playlist = [];
let autoScroll = true;

// DOM Elements
const loginPanel = document.getElementById('loginPanel');
const djControls = document.getElementById('djControls');
const djNicknameInput = document.getElementById('djNickname');
const djPasswordInput = document.getElementById('djpass');
const loginError = document.getElementById('loginError');
const connectionStatus = document.getElementById('connectionStatus');
const currentDJName = document.getElementById('currentDJName');
const djStartTime = document.getElementById('djStartTime');
const onlineUsers = document.getElementById('onlineUsers');
const streamStatus = document.getElementById('streamStatus');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const liveChat = document.getElementById('liveChat');
const djChatInput = document.getElementById('djChatInput');
const autoScrollBtn = document.getElementById('autoScrollBtn');
const musicFileInput = document.getElementById('musicFileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const uploadStatus = document.getElementById('uploadStatus');
const playlistItems = document.getElementById('playlistItems');
const musicLibrary = document.getElementById('musicLibrary');
const searchLibrary = document.getElementById('searchLibrary');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Check if already logged in
    const savedNickname = localStorage.getItem('nickname');
    const savedPassword = localStorage.getItem('djPassword');
    
    if (savedNickname && savedPassword) {
        djNicknameInput.value = savedNickname;
    }
});

// Socket Events
socket.on('connect', () => {
    connectionStatus.textContent = 'Bağlantı durumu: Bağlandı ✅';
    console.log('Sunucuya bağlandı');
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Bağlantı durumu: Bağlantı kesildi ❌';
    console.log('Sunucu bağlantısı kesildi');
});

socket.on('chat message', (data) => {
    addChatMessage(data);
});

socket.on('userJoined', (data) => {
    addSystemMessage(`👋 ${data.nickname} sohbete katıldı`);
});

socket.on('userLeft', (data) => {
    addSystemMessage(`👋 ${data.nickname} sohbeti terk etti`);
});

socket.on('userList', (users) => {
    onlineUsers.textContent = users.length;
});

// DJ Login
function checkPassword() {
    const nickname = djNicknameInput.value.trim();
    const password = djPasswordInput.value.trim();
    
    if (!nickname || !password) {
        loginError.textContent = '❌ Lütfen tüm alanları doldurun!';
        return;
    }
    
    // Check password
    if (password === '4545' || password === '4561') {
        // Login successful
        djNickname = nickname;
        isDJLoggedIn = true;
        
        // Save credentials
        localStorage.setItem('nickname', nickname);
        localStorage.setItem('djPassword', password);
        
        if (password === '4561') {
            localStorage.setItem('isAdmin', 'true');
        }
        
        // Show DJ controls
        loginPanel.style.display = 'none';
        djControls.style.display = 'block';
        
        // Update UI
        currentDJName.textContent = nickname;
        djStartTime.textContent = new Date().toLocaleTimeString('tr-TR');
        
        // Notify server
        socket.emit('activeDJ', { nickname, password });
        
        addSystemMessage(`✅ DJ ${nickname} olarak giriş yaptınız!`);
    } else {
        loginError.textContent = '❌ Hatalı şifre! Lütfen tekrar deneyin.';
    }
}

// Stream Controls
function startStream() {
    if (!isDJLoggedIn) {
        alert('Lütfen önce giriş yapın!');
        return;
    }
    
    isStreaming = true;
    streamStatus.textContent = 'Yayın açık ✅';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    socket.emit('activeDJ', djNickname);
    addSystemMessage('🎙️ Yayın başlatıldı!');
}

function stopStream() {
    isStreaming = false;
    streamStatus.textContent = 'Yayın kapalı ❌';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    socket.emit('stop playing', djNickname);
    addSystemMessage('🎙️ Yayın durduruldu!');
}

// Music Controls
function updateNowPlaying() {
    const songName = document.getElementById('songName').value.trim();
    const artistName = document.getElementById('artistName').value.trim();
    
    if (!songName) {
        alert('Lütfen şarkı adını girin!');
        return;
    }
    
    const fullSong = artistName ? `${songName} - ${artistName}` : songName;
    
    socket.emit('now playing', {
        song: fullSong,
        dj: djNickname
    });
    
    addSystemMessage(`🎵 Şu anda çalan güncellendi: ${fullSong}`);
}

// Announcements
function sendAnnouncement() {
    const text = document.getElementById('announcementText').value.trim();
    
    if (!text) {
        alert('Lütfen duyuru metnini girin!');
        return;
    }
    
    socket.emit('announcement', {
        dj: djNickname,
        text: text
    });
    
    document.getElementById('announcementText').value = '';
    addSystemMessage(`📢 Duyuru gönderildi: ${text}`);
}

// Sound Effects
function playSoundEffect(effect) {
    socket.emit('sound effect', {
        dj: djNickname,
        effect: effect
    });
    
    addSystemMessage(`🔊 Ses efekti çalındı: ${effect}`);
}

function playCustomEffect() {
    const text = document.getElementById('customSoundText').value.trim();
    
    if (!text) {
        alert('Lütfen ses efekti açıklaması girin!');
        return;
    }
    
    playSoundEffect(text);
    document.getElementById('customSoundText').value = '';
}

// File Upload
if (musicFileInput) {
    musicFileInput.addEventListener('change', handleFileUpload);
}

if (uploadArea) {
    // Drag and drop handlers
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#ff4081';
        uploadArea.style.background = 'rgba(255, 64, 129, 0.1)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        uploadArea.style.background = 'transparent';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        uploadArea.style.background = 'transparent';
        
        const files = e.dataTransfer.files;
        handleFiles(files);
    });
}

function handleFileUpload(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length === 0) return;
    
    uploadProgress.style.display = 'block';
    
    Array.from(files).forEach((file, index) => {
        // Simulate upload progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            uploadProgressFill.style.width = progress + '%';
            uploadStatus.textContent = `Yükleniyor... ${progress}%`;
            
            if (progress >= 100) {
                clearInterval(interval);
                uploadStatus.textContent = '✅ Yükleme tamamlandı!';
                
                uploadedFiles.push({
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                
                setTimeout(() => {
                    uploadProgress.style.display = 'none';
                    uploadProgressFill.style.width = '0%';
                }, 2000);
                
                addSystemMessage(`📁 Dosya yüklendi: ${file.name}`);
            }
        }, 200);
    });
}

// Playlist Management
function addToPlaylist() {
    const title = document.getElementById('songTitle').value.trim();
    const artist = document.getElementById('artistName').value.trim();
    
    if (!title) {
        alert('Lütfen şarkı adını girin!');
        return;
    }
    
    const song = {
        title,
        artist: artist || 'Bilinmeyen',
        addedBy: djNickname,
        timestamp: Date.now()
    };
    
    playlist.push(song);
    updatePlaylistDisplay();
    
    document.getElementById('songTitle').value = '';
    document.getElementById('artistName').value = '';
    
    addSystemMessage(`➕ Playlist'e eklendi: ${title}`);
}

function addUploadedToPlaylist() {
    if (uploadedFiles.length === 0) {
        alert('Henüz yüklenmiş dosya yok!');
        return;
    }
    
    uploadedFiles.forEach(file => {
        const song = {
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: djNickname,
            addedBy: djNickname,
            timestamp: Date.now()
        };
        
        playlist.push(song);
    });
    
    updatePlaylistDisplay();
    uploadedFiles = [];
    
    addSystemMessage('🎵 Yüklenen dosyalar playlist\'e eklendi');
}

function clearPlaylist() {
    if (confirm('Playlist\'i temizlemek istediğinizden emin misiniz?')) {
        playlist = [];
        updatePlaylistDisplay();
        addSystemMessage('🗑️ Playlist temizlendi');
    }
}

function updatePlaylistDisplay() {
    playlistItems.innerHTML = '';
    
    if (playlist.length === 0) {
        playlistItems.innerHTML = '<p style="text-align: center; opacity: 0.7;">Playlist boş</p>';
        return;
    }
    
    playlist.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `
            <span>${index + 1}. ${song.title} - ${song.artist}</span>
            <button onclick="removeFromPlaylist(${index})" class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;">🗑️</button>
        `;
        playlistItems.appendChild(item);
    });
}

function removeFromPlaylist(index) {
    playlist.splice(index, 1);
    updatePlaylistDisplay();
}

function playNextSong() {
    if (playlist.length === 0) {
        alert('Playlist boş!');
        return;
    }
    
    const nextSong = playlist.shift();
    document.getElementById('songName').value = nextSong.title;
    document.getElementById('artistName').value = nextSong.artist;
    updateNowPlaying();
    updatePlaylistDisplay();
}

// Library Functions
function refreshLibrary() {
    addSystemMessage('🔄 Kütüphane yenileniyor...');
    // In a real implementation, this would fetch from the server
}

// Quick Actions
function requestSong() {
    const song = prompt('Hangi şarkıyı istemek istersiniz?');
    if (song) {
        addSystemMessage(`🎤 Şarkı isteği: ${song}`);
    }
}

function showStats() {
    const stats = `
📊 İstatistikler:
- Çevrimiçi: ${onlineUsers.textContent} kullanıcı
- Playlist: ${playlist.length} şarkı
- Yüklenen: ${uploadedFiles.length} dosya
- Yayın: ${isStreaming ? 'Açık' : 'Kapalı'}
    `;
    alert(stats);
}

function emergencyStop() {
    if (confirm('🚨 ACİL DURDUR! Yayını durdurmak istediğinizden emin misiniz?')) {
        stopStream();
        addSystemMessage('🚨 Acil durdurma yapıldı!');
    }
}

// Chat Functions
function sendDJMessage() {
    const message = djChatInput.value.trim();
    if (!message) return;
    
    const messageData = {
        nickname: djNickname,
        text: message,
        isDJ: true,
        timestamp: new Date().toISOString()
    };
    
    socket.emit('chat message', messageData);
    djChatInput.value = '';
    
    addChatMessage(messageData);
}

function sendQuickResponse(text) {
    const messageData = {
        nickname: djNickname,
        text: text,
        isDJ: true,
        timestamp: new Date().toISOString()
    };
    
    socket.emit('chat message', messageData);
    addChatMessage(messageData);
}

function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${data.isDJ ? 'dj' : ''}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <strong>${data.nickname}</strong> ${data.isDJ ? '🎙️' : ''} (${time}): ${data.text}
    `;
    
    liveChat.appendChild(messageDiv);
    
    if (autoScroll) {
        liveChat.scrollTop = liveChat.scrollHeight;
    }
    
    // Limit messages
    const messages = liveChat.children;
    if (messages.length > 100) {
        liveChat.removeChild(messages[0]);
    }
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system';
    messageDiv.textContent = text;
    
    liveChat.appendChild(messageDiv);
    
    if (autoScroll) {
        liveChat.scrollTop = liveChat.scrollHeight;
    }
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    autoScrollBtn.textContent = autoScroll ? '📌 Otomatik Kaydır' : '📌 Manuel Kaydır';
    autoScrollBtn.style.background = autoScroll ? 'rgba(78, 205, 196, 0.3)' : 'rgba(255, 255, 255, 0.1)';
}

function clearChat() {
    if (confirm('Chat geçmişini temizlemek istediğinizden emin misiniz?')) {
        liveChat.innerHTML = '';
        addSystemMessage('🗑️ Chat temizlendi');
    }
}

// Enter key handlers
if (djChatInput) {
    djChatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendDJMessage();
        }
    });
}

if (djPasswordInput) {
    djPasswordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkPassword();
        }
    });
}

// Auto-update user count
setInterval(() => {
    fetch('/api/users')
        .then(response => response.json())
        .then(users => {
            onlineUsers.textContent = users.length;
        })
        .catch(error => console.error('Kullanıcı sayısı güncellenemedi:', error));
}, 30000);
