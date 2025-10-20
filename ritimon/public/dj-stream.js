// DJ Stream JavaScript - Enhanced with Socket.io
const socket = io();
let isDJLoggedIn = false;
let isStreaming = false;
let djNickname = '';
let djStartTime = null;
let playlist = [];
let currentSongIndex = 0;
let songHistory = [];
let totalSongsPlayed = 0;
let musicLibrary = [];
let uploadedFiles = [];
let draggedIndex = null; // for drag & drop reordering
let livekitRoom = null;
let livekitLocalTracks = [];

// DOM Elements
const loginPanel = document.getElementById('loginPanel');
const djControls = document.getElementById('djControls');
const loginError = document.getElementById('loginError');
const connectionStatus = document.getElementById('connectionStatus');
const streamStatus = document.getElementById('streamStatus');
const currentDJName = document.getElementById('currentDJName');
const djStartTimeEl = document.getElementById('djStartTime');
const onlineUsersEl = document.getElementById('onlineUsers');
const liveChat = document.getElementById('liveChat');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Focus on nickname input
    document.getElementById('djNickname').focus();
    
    // Add enter key listeners
    document.getElementById('djNickname').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('djpass').focus();
        }
    });
    
    document.getElementById('djpass').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkPassword();
        }
    });
    
    // Load saved DJ name
    const savedDJ = localStorage.getItem('djNickname');
    if (savedDJ) {
        document.getElementById('djNickname').value = savedDJ;
    }
    
    // Initialize upload functionality (local-only, no server upload)
    initializeUpload();
    
    // Initialize drag & drop for playlist
    initPlaylistDnD();
    
    // Initialize empty library (local)
    loadMusicLibrary();

    // Prepare LiveKit publish buttons if available
    const publishBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (publishBtn && stopBtn) {
        publishBtn.addEventListener('click', startWebBroadcast);
        stopBtn.addEventListener('click', stopWebBroadcast);
    }
});

// Socket Events
socket.on('connect', () => {
    connectionStatus.textContent = 'Bağlantı durumu: Bağlandı ✅';
    connectionStatus.style.color = '#4ecdc4';
    console.log('Sunucuya bağlandı');
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Bağlantı durumu: Bağlantı kesildi ❌';
    connectionStatus.style.color = '#ff6b6b';
    console.log('Sunucu bağlantısı kesildi');
});

socket.on('joined', (user) => {
    djNickname = user.nickname;
    currentDJName.textContent = user.nickname;
    djStartTime = new Date(user.joinTime);
    djStartTimeEl.textContent = djStartTime.toLocaleTimeString('tr-TR');
    
    // Save DJ name
    localStorage.setItem('djNickname', djNickname);
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
    updateOnlineUsers(users.length);
});

socket.on('userStatus', (data) => {
    const status = data.status === 'online' ? '🟢' : '🟡';
    addSystemMessage(`${status} ${data.nickname} ${data.status === 'online' ? 'çevrimiçi' : 'uzakta'}`);
});

// DJ Functions
function checkPassword() {
    const nickname = document.getElementById('djNickname').value.trim();
    const password = document.getElementById('djpass').value;
    
    if (!nickname) {
        showError('DJ adı boş olamaz!');
        return;
    }
    
    if (password !== '4545') {
        showError('Şifre yanlış! Doğru şifre: 4545');
        return;
    }
    
    // Join with DJ nickname
    socket.emit('join', { nickname });
    
    // Show DJ controls
    loginPanel.style.display = 'none';
    djControls.style.display = 'block';
    isDJLoggedIn = true;
    
    // Start DJ session
    socket.emit('dj login', { nickname });
    
    hideError();
    console.log(`DJ ${nickname} giriş yaptı`);
}

function startStream() {
    if (!isDJLoggedIn) return;
    
    navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } 
    })
    .then(stream => {
        isStreaming = true;
        updateStreamStatus('Yayın aktif 🟢');
        
        // Update button states
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        
        // Store stream for cleanup
        window.djStream = stream;
        
        console.log('Yayın başlatıldı');
    })
    .catch(error => {
        console.error('Mikrofon erişimi hatası:', error);
        showError('Mikrofon erişimi reddedildi: ' + error.message);
    });
}

function stopStream() {
    if (window.djStream) {
        window.djStream.getTracks().forEach(track => track.stop());
        window.djStream = null;
    }
    
    isStreaming = false;
    updateStreamStatus('Yayın kapalı 🔴');
    
    // Update button states
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    
    // Notify server
    socket.emit('dj stop');
    
    console.log('Yayın durduruldu');
}

function updateNowPlaying() {
    const songName = document.getElementById('songName').value.trim();
    const artistName = document.getElementById('artistName').value.trim();
    
    if (!songName) {
        showError('Şarkı adı boş olamaz!');
        return;
    }
    
    const fullSong = artistName ? `${songName} - ${artistName}` : songName;
    
    socket.emit('dj play', { song: fullSong });
    
    addSystemMessage(`🎵 Şu anda çalan: ${fullSong}`);
    console.log(`Şarkı güncellendi: ${fullSong}`);
}

function sendAnnouncement() {
    const text = document.getElementById('announcementText').value.trim();
    
    if (!text) {
        showError('Duyuru metni boş olamaz!');
        return;
    }
    
    socket.emit('dj announcement', { text });
    document.getElementById('announcementText').value = '';
    
    addSystemMessage(`📢 Duyuru gönderildi: ${text}`);
    console.log(`Duyuru gönderildi: ${text}`);
}

function requestSong() {
    const songName = prompt('İstenen şarkı adı:');
    if (songName && songName.trim()) {
        socket.emit('chat message', {
            text: `🎤 Şarkı isteği: ${songName.trim()}`,
            timestamp: new Date().toISOString()
        });
        addSystemMessage(`🎤 Şarkı isteği gönderildi: ${songName.trim()}`);
    }
}

function showStats() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            const stats = `
📊 RitimON FM İstatistikleri:
• Çevrimiçi kullanıcı: ${data.onlineUsers}
• Aktif DJ: ${data.activeDJs}
• Sunucu çalışma süresi: ${Math.floor(data.uptime / 60)} dakika
• Şu anki zaman: ${new Date().toLocaleString('tr-TR')}
            `;
            alert(stats);
        })
        .catch(error => {
            console.error('İstatistik hatası:', error);
            showError('İstatistikler alınamadı');
        });
}

function emergencyStop() {
    if (confirm('🚨 ACİL DURDUR\n\nTüm yayınları durdurmak istediğinizden emin misiniz?')) {
        stopStream();
        socket.emit('dj announcement', { text: '🚨 ACİL DURUM: Yayın durduruldu!' });
        addSystemMessage('🚨 Acil durdurma gerçekleştirildi');
    }
}

// Helper Functions
function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (data.type === 'system') {
        messageDiv.classList.add('system');
    } else if (data.text.includes('📢')) {
        messageDiv.classList.add('announcement');
    }
    
    const time = new Date(data.timestamp).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <strong>${data.nickname}</strong> (${time}): ${data.text}
    `;
    
    liveChat.appendChild(messageDiv);
    liveChat.scrollTop = liveChat.scrollHeight;
    
    // Limit chat messages to prevent memory issues
    const messages = liveChat.children;
    if (messages.length > 50) {
        liveChat.removeChild(messages[0]);
    }
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system';
    messageDiv.textContent = text;
    
    liveChat.appendChild(messageDiv);
    liveChat.scrollTop = liveChat.scrollHeight;
}

function updateStreamStatus(status) {
    streamStatus.textContent = status;
    streamStatus.style.color = status.includes('aktif') ? '#4ecdc4' : '#ff6b6b';
}

function updateOnlineUsers(count) {
    onlineUsersEl.textContent = count;
}

function showError(message) {
    loginError.textContent = message;
    loginError.classList.add('show');
    setTimeout(hideError, 5000);
}

function hideError() {
    loginError.classList.remove('show');
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (isStreaming) {
        stopStream();
    }
    if (isDJLoggedIn) {
        socket.emit('leave', { nickname: djNickname });
    }
});

// Handle page visibility change
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        socket.emit('userAway');
    } else {
        socket.emit('userBack');
    }
});

// Playlist Functions
function addToPlaylist() {
    const songTitle = document.getElementById('songTitle').value.trim();
    const artistName = document.getElementById('artistName').value.trim();
    
    if (!songTitle) {
        showError('Şarkı adı boş olamaz!');
        return;
    }
    
    const song = {
        title: songTitle,
        artist: artistName,
        id: Date.now(),
        addedBy: djNickname,
        addedAt: new Date().toISOString()
    };
    
    playlist.push(song);
    updatePlaylistDisplay();
    
    // Clear inputs
    document.getElementById('songTitle').value = '';
    document.getElementById('artistName').value = '';
    
    addSystemMessage(`📝 "${songTitle}" playlist'e eklendi`);
    console.log(`Şarkı playlist'e eklendi: ${songTitle}`);
}

function clearPlaylist() {
    if (confirm('Playlist\'i temizlemek istediğinizden emin misiniz?')) {
        playlist = [];
        currentSongIndex = 0;
        updatePlaylistDisplay();
        addSystemMessage('🗑️ Playlist temizlendi');
        console.log('Playlist temizlendi');
    }
}

function updatePlaylistDisplay() {
    const playlistItems = document.getElementById('playlistItems');
    playlistItems.innerHTML = '';
    
    if (playlist.length === 0) {
        playlistItems.innerHTML = '<p style="text-align: center; opacity: 0.7;">Playlist boş</p>';
        return;
    }
    
    playlist.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.setAttribute('draggable', 'true');
        item.dataset.index = String(index);
        item.innerHTML = `
            <div class="playlist-song">
                <span class="song-number">${index + 1}.</span>
                <span class="song-title">${song.title}</span>
                ${song.artist ? `<span class="song-artist"> - ${song.artist}</span>` : ''}
            </div>
            <div>
              <button onclick="removeFromPlaylist(${index})" class="remove-btn" title="Kaldır">❌</button>
            </div>
        `;
        playlistItems.appendChild(item);
    });
}

function removeFromPlaylist(index) {
    const song = playlist[index];
    playlist.splice(index, 1);
    updatePlaylistDisplay();
    addSystemMessage(`🗑️ "${song.title}" playlist'ten çıkarıldı`);
}

function playNextSong() {
    if (playlist.length === 0) {
        showError('Playlist boş! Önce şarkı ekleyin.');
        return;
    }
    
    if (currentSongIndex >= playlist.length) {
        currentSongIndex = 0; // döngü
    }
    
    const song = playlist[currentSongIndex];
    const fullSong = song.artist ? `${song.title} - ${song.artist}` : song.title;
    
    // Add to history
    songHistory.unshift({
        ...song,
        playedAt: new Date().toISOString(),
        playedBy: djNickname
    });
    
    // Limit history to 50 songs
    if (songHistory.length > 50) {
        songHistory = songHistory.slice(0, 50);
    }
    
    totalSongsPlayed++;
    currentSongIndex++;
    
    // Update now playing
    socket.emit('dj play', { song: fullSong });
    addSystemMessage(`🎵 Şu anda çalan: ${fullSong}`);
    
    console.log(`Sonraki şarkı çalınıyor: ${fullSong}`);
}

// Sound Effects Functions
function playSoundEffect(effect) {
    const effects = {
        applause: '👏👏👏 Alkış sesi çalındı!',
        cheer: '🎉🎉🎉 Kutlama sesi çalındı!',
        drumroll: '🥁🥁🥁 Davul sesi çalındı!',
        bell: '🔔🔔🔔 Zil sesi çalındı!',
        whistle: '📯📯📯 Düdük sesi çalındı!',
        airhorn: '📢📢📢 Hava korna sesi çalındı!'
    };
    
    const message = effects[effect] || '🔊 Ses efekti çalındı!';
    
    // Broadcast to all users
    socket.emit('chat message', {
        nickname: 'Sistem',
        text: message,
        timestamp: new Date().toISOString(),
        type: 'system'
    });
    
    addSystemMessage(message);
    console.log(`Ses efekti çalındı: ${effect}`);
}

function playCustomEffect() {
    const effectText = document.getElementById('customSoundText').value.trim();
    
    if (!effectText) {
        showError('Ses efekti açıklaması boş olamaz!');
        return;
    }
    
    const message = `🔊 ${effectText}`;
    
    socket.emit('chat message', {
        nickname: 'Sistem',
        text: message,
        timestamp: new Date().toISOString(),
        type: 'system'
    });
    
    document.getElementById('customSoundText').value = '';
    addSystemMessage(`Özel ses efekti: ${effectText}`);
    console.log(`Özel ses efekti: ${effectText}`);
}

// Statistics Functions
function getPlaylistStats() {
    return {
        totalSongs: playlist.length,
        totalPlayed: totalSongsPlayed,
        currentIndex: currentSongIndex,
        historyLength: songHistory.length
    };
}

// Upload Functions (local-only)
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('musicFileInput');
    
    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFiles(files);
        }
    });
    
    // Click to upload
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFiles(e.target.files);
        }
    });
}

function uploadFiles(files) {
    Array.from(files).forEach(file => {
        if (file.type.startsWith('audio/')) {
            uploadFile(file);
        } else {
            showError(`${file.name} bir ses dosyası değil!`);
        }
    });
}

function uploadFile(file) {
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressFill = document.getElementById('uploadProgressFill');
    const uploadStatus = document.getElementById('uploadStatus');
    
    // Fake progress UI then add locally (no server upload)
    uploadProgress.style.display = 'block';
    uploadStatus.textContent = `${file.name} işleniyor...`;
    
    const reader = new FileReader();
    reader.onload = () => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        const musicInfo = {
            id,
            originalName: file.name,
            size: file.size,
            uploadedAt: Date.now(),
            uploadedBy: djNickname || 'DJ',
            // local-only playback reference
            blobUrl: URL.createObjectURL(new Blob([reader.result]))
        };
        musicLibrary.push(musicInfo);
        uploadedFiles.push(musicInfo);
        updateMusicLibrary();
        uploadStatus.textContent = `${file.name} eklendi`;
        setTimeout(() => {
            uploadProgress.style.display = 'none';
            uploadProgressFill.style.width = '0%';
        }, 1200);
        addSystemMessage(`🎵 ${file.name} eklendi (yerel)`);
    };
    reader.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            uploadProgressFill.style.width = percentComplete + '%';
        }
    };
    reader.onerror = () => {
        showError('Dosya okunamadı');
        uploadProgress.style.display = 'none';
    };
    reader.readAsArrayBuffer(file);
}

function loadMusicLibrary() {
    // Local-only: nothing to fetch, just render what we have
    updateMusicLibrary();
}

function updateMusicLibrary() {
    const libraryContainer = document.getElementById('musicLibrary');
    libraryContainer.innerHTML = '';
    
    if (musicLibrary.length === 0) {
        libraryContainer.innerHTML = '<p style="text-align: center; opacity: 0.7;">Henüz müzik yüklenmedi</p>';
        return;
    }
    
    musicLibrary.forEach(music => {
        const item = document.createElement('div');
        item.className = 'library-item';
        
        const fileSize = music.size ? (music.size / (1024 * 1024)).toFixed(2) : '—';
        const uploadDate = music.uploadedAt ? new Date(music.uploadedAt).toLocaleDateString('tr-TR') : '-';
        
        item.innerHTML = `
            <div class="library-item-info">
                <div class="library-item-title">${music.originalName || music.title}</div>
                <div class="library-item-details">
                    <span>📅 ${uploadDate}</span>
                    <span>📊 ${fileSize} MB</span>
                    <span>👤 ${music.uploadedBy || 'DJ'}</span>
                </div>
            </div>
            <div class="library-item-actions">
                <button onclick="playMusicById(${music.id})" class="library-action-btn play">▶️ Çal</button>
                <button onclick="addMusicToPlaylist(${music.id})" class="library-action-btn">➕ Ekle</button>
                <button onclick="deleteMusic(${music.id})" class="library-action-btn delete">🗑️ Sil</button>
            </div>
        `;
        
        libraryContainer.appendChild(item);
    });
}

function playMusic(path) {
    // Simulate now playing announcement only (real audio is streamed externally)
    const fullSong = path.split('/').pop().replace(/\.[^/.]+$/, "");
    socket.emit('dj play', { song: fullSong });
    addSystemMessage(`🎵 ${fullSong} çalınıyor`);
}

function playMusicById(musicId) {
    const music = musicLibrary.find(m => m.id === musicId);
    if (music) {
        const baseName = (music.originalName || music.title || '').replace(/\.[^/.]+$/, "");
        const fullSong = baseName || `Parça #${musicId}`;
        socket.emit('dj play', { song: fullSong, musicId: musicId });
        addSystemMessage(`🎵 ${fullSong} çalınıyor (geçici dosya)`);
    }
}

function addMusicToPlaylist(musicId) {
    const music = musicLibrary.find(m => m.id === musicId);
    if (music) {
        const song = {
            title: (music.originalName || music.title || '').replace(/\.[^/.]+$/, ""),
            artist: 'Uploaded',
            id: music.id,
            addedBy: djNickname,
            addedAt: new Date().toISOString(),
            path: music.path,
            blobUrl: music.blobUrl
        };
        
        playlist.push(song);
        updatePlaylistDisplay();
        addSystemMessage(`📝 "${song.title}" playlist'e eklendi`);
    }
}

function deleteMusic(musicId) {
    if (confirm('Bu müzik dosyasını silmek istediğinizden emin misiniz?')) {
        const target = musicLibrary.find(m => m.id === musicId);
        if (target && target.blobUrl) { try { URL.revokeObjectURL(target.blobUrl); } catch(e){} }
        musicLibrary = musicLibrary.filter(m => m.id !== musicId);
        updateMusicLibrary();
        addSystemMessage('🗑️ Müzik dosyası silindi');
    }
}

function addUploadedToPlaylist() {
    if (uploadedFiles.length === 0) {
        showError('Henüz dosya yüklenmedi!');
        return;
    }
    
    const latestFile = uploadedFiles[uploadedFiles.length - 1];
    addMusicToPlaylist(latestFile.id);
}

function refreshLibrary() {
    loadMusicLibrary();
    addSystemMessage('🔄 Müzik kütüphanesi yenilendi');
}

// Socket event for new music uploads
socket.on('musicUploaded', (musicInfo) => {
    musicLibrary.push(musicInfo);
    updateMusicLibrary();
    addSystemMessage(`🎵 Yeni müzik yüklendi: ${musicInfo.originalName} (geçici)`);
});

// Socket event for music deletion
socket.on('musicDeleted', (data) => {
    musicLibrary = musicLibrary.filter(m => m.id !== data.id);
    updateMusicLibrary();
    addSystemMessage(`🗑️ Müzik dosyası silindi`);
});

// DJ Chat Functions
let autoScroll = true;
let selectedUser = null;

function sendDJMessage() {
    const message = document.getElementById('djChatInput').value.trim();
    if (message === '') return;
    
    socket.emit('chat message', {
        text: message,
        timestamp: new Date().toISOString()
    });
    
    document.getElementById('djChatInput').value = '';
    addSystemMessage(`DJ mesajı gönderildi: ${message}`);
}

function sendQuickResponse(response) {
    document.getElementById('djChatInput').value = response;
    sendDJMessage();
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const btn = document.getElementById('autoScrollBtn');
    btn.textContent = autoScroll ? '📌 Otomatik Kaydır' : '📌 Manuel';
    btn.style.background = autoScroll ? 'linear-gradient(45deg, #4ecdc4, #44a08d)' : 'linear-gradient(45deg, #667eea, #764ba2)';
}

function clearChat() {
    if (confirm('Tüm chat mesajlarını temizlemek istediğinizden emin misiniz?')) {
        document.getElementById('liveChat').innerHTML = '';
        addSystemMessage('🗑️ Chat temizlendi');
    }
}

// Context Menu Functions
function showContextMenu(event, userId, nickname) {
    event.preventDefault();
    selectedUser = { userId, nickname };
    
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    // Hide menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 100);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

function warnUser() {
    if (!selectedUser) return;
    
    const reason = prompt(`Uyarı nedeni (${selectedUser.nickname}):`);
    if (reason !== null) {
        socket.emit('warnUser', {
            targetNickname: selectedUser.nickname,
            reason: reason
        });
        addSystemMessage(`⚠️ ${selectedUser.nickname} uyarıldı: ${reason}`);
    }
    hideContextMenu();
}

function timeoutUser() {
    if (!selectedUser) return;
    
    const duration = prompt(`${selectedUser.nickname} için yasak süresi (dakika):`, '5');
    if (duration !== null && !isNaN(duration)) {
        const reason = prompt('Yasak nedeni:');
        socket.emit('muteUser', {
            targetNickname: selectedUser.nickname,
            duration: parseInt(duration),
            reason: reason || 'Kurallara uygun davranmayın'
        });
        addSystemMessage(`⏰ ${selectedUser.nickname} ${duration} dakika yasaklandı`);
    }
    hideContextMenu();
}

function banUser() {
    if (!selectedUser) return;
    
    if (confirm(`${selectedUser.nickname} kullanıcısını kalıcı olarak yasaklamak istediğinizden emin misiniz?`)) {
        const reason = prompt('Yasak nedeni:');
        socket.emit('banUser', {
            targetNickname: selectedUser.nickname,
            reason: reason || 'Kurallara uygun davranmayın'
        });
        addSystemMessage(`🚫 ${selectedUser.nickname} kalıcı olarak yasaklandı`);
    }
    hideContextMenu();
}

function muteUser() {
    if (!selectedUser) return;
    
    const duration = prompt(`${selectedUser.nickname} için susturma süresi (dakika):`, '5');
    if (duration !== null && !isNaN(duration)) {
        socket.emit('muteUser', {
            targetNickname: selectedUser.nickname,
            duration: parseInt(duration),
            reason: 'Susturma'
        });
        addSystemMessage(`🔇 ${selectedUser.nickname} ${duration} dakika susturuldu`);
    }
    hideContextMenu();
}

function viewProfile() {
    if (!selectedUser) return;
    
    const user = Array.from(onlineUsers.values()).find(u => u.nickname === selectedUser.nickname);
    if (user) {
        alert(`👤 Kullanıcı Profili:
        
Ad: ${user.nickname}
Katılım: ${new Date(user.joinTime).toLocaleString('tr-TR')}
Uyarı Sayısı: ${user.warnings || 0}
Durum: ${user.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
${user.isMuted ? 'Susturulmuş' : ''}`);
    }
    hideContextMenu();
}

// Auto-refresh online users every 30 seconds
setInterval(() => {
    if (isDJLoggedIn) {
        fetch('/api/users')
            .then(response => response.json())
            .then(users => updateOnlineUsers(users.length))
            .catch(error => console.error('Kullanıcı sayısı güncellenemedi:', error));
    }
}, 30000);

// Playlist Drag & Drop
function initPlaylistDnD() {
    const list = document.getElementById('playlistItems');
    list.addEventListener('dragstart', (e) => {
        const target = e.target.closest('.playlist-item');
        if (!target) return;
        draggedIndex = Number(target.dataset.index);
    });
    list.addEventListener('dragover', (e) => { e.preventDefault(); });
    list.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.playlist-item');
        if (!target) return;
        const targetIndex = Number(target.dataset.index);
        if (isNaN(draggedIndex) || isNaN(targetIndex) || draggedIndex === targetIndex) return;
        const [moved] = playlist.splice(draggedIndex, 1);
        playlist.splice(targetIndex, 0, moved);
        updatePlaylistDisplay();
    });
}

// ---------------- LiveKit Web DJ (browser publish) ----------------
async function startWebBroadcast() {
    try {
        const identity = 'dj_' + (djNickname || 'anon');
        const tokenResp = await fetch(`/api/livekit/token?role=publisher&identity=${encodeURIComponent(identity)}`);
        const { token, url, room } = await tokenResp.json();
        if (!token || !url) {
            showError('Canlı yayın yapılandırması eksik (LiveKit).');
            return;
        }
        // Lazy import LiveKit client
        const { connect, createLocalTracks } = await import('https://cdn.skypack.dev/livekit-client');
        livekitRoom = await connect(url, token);
        // Mic (PTT için toggle edilebilir), sistem sesi yok; yerel playlist sadece duyuru gönderir
        livekitLocalTracks = await createLocalTracks({ audio: true });
        for (const t of livekitLocalTracks) await livekitRoom.localParticipant.publishTrack(t);
        updateStreamStatus('Yayın aktif 🟢');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        addSystemMessage('🔴 Web DJ yayını başladı');
    } catch (e) {
        console.error('Web publish error', e);
        showError('Yayın başlatılamadı');
    }
}

async function stopWebBroadcast() {
    try {
        for (const t of livekitLocalTracks) { try { await t.stop(); } catch(e){} }
        livekitLocalTracks = [];
        if (livekitRoom) { try { await livekitRoom.disconnect(); } catch(e){} livekitRoom = null; }
        updateStreamStatus('Yayın kapalı 🔴');
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        addSystemMessage('⏹️ Web DJ yayını durdu');
    } catch(e) {}
}