// Listener JavaScript - Radio Stream Player
const socket = io();
let isPlaying = false;
let currentVolume = 50;
let djStartTime = null;
let songHistory = [];
let totalListenTime = 0;
let sessionStartTime = Date.now();
let peakListeners = 0;
let totalSongs = 0;

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const statusDot = connectionStatus.querySelector('.status-dot');
const onlineCount = document.getElementById('onlineCount');
const currentTrack = document.getElementById('currentTrack');
const currentArtist = document.getElementById('currentArtist');
const progressFill = document.getElementById('progressFill');
const currentTime = document.getElementById('currentTime');
const totalTime = document.getElementById('totalTime');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = playPauseBtn.querySelector('.play-icon');
const volumeIcon = document.getElementById('volumeIcon');
const volumeControl = document.getElementById('volumeControl');
const recentMessages = document.getElementById('recentMessages');
const djName = document.getElementById('djName');
const djStatus = document.getElementById('djStatus');
const djInitial = document.getElementById('djInitial');
const djDuration = document.getElementById('djDuration');
const vinyl = document.getElementById('vinyl');
const radioStream = document.getElementById('radioStream');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Set initial volume
    radioStream.volume = currentVolume / 100;
    
    // Load saved volume
    const savedVolume = localStorage.getItem('radioVolume');
    if (savedVolume) {
        currentVolume = parseInt(savedVolume);
        volumeControl.value = currentVolume;
        radioStream.volume = currentVolume / 100;
        updateVolumeIcon();
    }
    
    // Load statistics
    loadStatistics();
    
    // Initialize time display
    updateTimeDisplay();
    
    // Start time update interval
    setInterval(updateTimeDisplay, 1000);
    setInterval(updateDJDuration, 1000);
});

// Socket Events
socket.on('connect', () => {
    statusDot.classList.add('connected');
    connectionStatus.querySelector('span:last-child').textContent = 'Bağlandı';
    console.log('Sunucuya bağlandı');
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    connectionStatus.querySelector('span:last-child').textContent = 'Bağlantı kesildi';
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
    onlineCount.textContent = users.length;
    
    // Update peak listeners
    if (users.length > peakListeners) {
        peakListeners = users.length;
        updateStatistics();
    }
});

socket.on('activeDJ', (data) => {
    djName.textContent = data.nickname;
    djInitial.textContent = data.nickname.charAt(0).toUpperCase();
    djStatus.textContent = 'Yayında';
    djStartTime = new Date();
    addSystemMessage(`🎙️ DJ ${data.nickname} yayına başladı!`);
});

socket.on('now playing', (data) => {
    const [song, artist] = data.song.split(' - ');
    currentTrack.textContent = song || data.song;
    currentArtist.textContent = artist ? `${artist} - DJ ${data.dj}` : `DJ ${data.dj}`;
    
    // Start vinyl animation if not playing
    if (!isPlaying) {
        vinyl.classList.add('playing');
    }
    
    // Add to song history
    songHistory.unshift({
        title: song || data.song,
        artist: artist || data.dj,
        timestamp: new Date().toISOString(),
        dj: data.dj
    });
    
    // Limit history to 20 songs
    if (songHistory.length > 20) {
        songHistory = songHistory.slice(0, 20);
    }
    
    totalSongs++;
    updateSongHistory();
    updateStatistics();
    
    addSystemMessage(`🎵 Şu anda çalan: ${data.song}`);
});

socket.on('stop playing', (data) => {
    currentTrack.textContent = 'Yayın durdu';
    currentArtist.textContent = `DJ ${data.nickname} yayını sonlandırdı`;
    djStatus.textContent = 'Yayın kapalı';
    
    // Stop vinyl animation
    vinyl.classList.remove('playing');
    
    addSystemMessage(`🎙️ DJ ${data.nickname} yayını durdurdu`);
});

socket.on('announcement', (data) => {
    addAnnouncement(data);
});

// Player Functions
function togglePlay() {
    if (isPlaying) {
        pauseRadio();
    } else {
        playRadio();
    }
}

function playRadio() {
    // For demo purposes, we'll simulate radio playback
    // In a real implementation, you would connect to an actual radio stream
    isPlaying = true;
    playIcon.textContent = '⏸️';
    vinyl.classList.add('playing');
    
    // Simulate progress
    startProgressSimulation();
    
    console.log('Radyo çalmaya başladı');
}

function pauseRadio() {
    isPlaying = false;
    playIcon.textContent = '▶️';
    vinyl.classList.remove('playing');
    
    console.log('Radyo duraklatıldı');
}

function setVolume(value) {
    currentVolume = parseInt(value);
    radioStream.volume = currentVolume / 100;
    updateVolumeIcon();
    
    // Save volume preference
    localStorage.setItem('radioVolume', currentVolume);
}

function toggleVolume() {
    if (currentVolume === 0) {
        setVolume(50);
    } else {
        setVolume(0);
    }
    volumeControl.value = currentVolume;
}

function updateVolumeIcon() {
    if (currentVolume === 0) {
        volumeIcon.textContent = '🔇';
    } else if (currentVolume < 30) {
        volumeIcon.textContent = '🔉';
    } else if (currentVolume < 70) {
        volumeIcon.textContent = '🔊';
    } else {
        volumeIcon.textContent = '🔊';
    }
}

function requestSong() {
    const songName = prompt('İstenen şarkı adı:');
    if (songName && songName.trim()) {
        addSystemMessage(`🎤 Şarkı isteği: ${songName.trim()}`);
        // In a real implementation, this would send the request to the DJ
        console.log(`Şarkı isteği: ${songName.trim()}`);
    }
}

function openChat() {
    window.open('chat.html', '_blank', 'width=800,height=600');
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
    
    recentMessages.appendChild(messageDiv);
    recentMessages.scrollTop = recentMessages.scrollHeight;
    
    // Limit messages to prevent memory issues
    const messages = recentMessages.children;
    if (messages.length > 20) {
        recentMessages.removeChild(messages[0]);
    }
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message system';
    messageDiv.textContent = text;
    
    recentMessages.appendChild(messageDiv);
    recentMessages.scrollTop = recentMessages.scrollHeight;
}

function addAnnouncement(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message announcement';
    messageDiv.textContent = `📢 ${data.dj} duyuruyor: ${data.text}`;
    
    recentMessages.appendChild(messageDiv);
    recentMessages.scrollTop = recentMessages.scrollHeight;
}

function startProgressSimulation() {
    let progress = 0;
    const progressInterval = setInterval(() => {
        if (!isPlaying) {
            clearInterval(progressInterval);
            return;
        }
        
        progress += 0.5;
        if (progress > 100) {
            progress = 0;
        }
        
        progressFill.style.width = progress + '%';
        currentTime.textContent = formatTime(progress * 3); // Simulate 5-minute songs
        totalTime.textContent = '05:00';
    }, 100);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimeDisplay() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // You could add a clock display here if needed
}

function updateDJDuration() {
    if (djStartTime) {
        const now = new Date();
        const duration = Math.floor((now - djStartTime) / 1000);
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        
        let durationText = '';
        if (hours > 0) {
            durationText = `${hours}:${minutes.toString().padStart(2, '0')}`;
        } else {
            durationText = `${minutes}:${(duration % 60).toString().padStart(2, '0')}`;
        }
        
        djDuration.textContent = durationText;
    }
    
    // Update listen time
    if (isPlaying) {
        totalListenTime = Math.floor((Date.now() - sessionStartTime) / 1000);
        updateStatistics();
    }
}

function updateSongHistory() {
    const songHistoryEl = document.getElementById('songHistory');
    songHistoryEl.innerHTML = '';
    
    if (songHistory.length === 0) {
        songHistoryEl.innerHTML = '<p style="text-align: center; opacity: 0.7;">Henüz şarkı çalmadı</p>';
        return;
    }
    
    songHistory.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        const time = new Date(song.timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        item.innerHTML = `
            <div class="history-song">${song.title}</div>
            <div class="history-time">${time}</div>
        `;
        
        songHistoryEl.appendChild(item);
    });
}

function updateStatistics() {
    // Update total songs
    document.getElementById('totalSongs').textContent = totalSongs;
    
    // Update listen time
    const minutes = Math.floor(totalListenTime / 60);
    document.getElementById('totalListenTime').textContent = `${minutes}m`;
    
    // Update peak listeners
    document.getElementById('peakListeners').textContent = peakListeners;
    
    // Save to localStorage
    localStorage.setItem('listenerStats', JSON.stringify({
        totalSongs,
        totalListenTime,
        peakListeners,
        sessionStartTime
    }));
}

// Load saved statistics
function loadStatistics() {
    const saved = localStorage.getItem('listenerStats');
    if (saved) {
        const stats = JSON.parse(saved);
        totalSongs = stats.totalSongs || 0;
        totalListenTime = stats.totalListenTime || 0;
        peakListeners = stats.peakListeners || 0;
        sessionStartTime = stats.sessionStartTime || Date.now();
        
        updateStatistics();
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const newVolume = Math.min(100, currentVolume + 10);
        setVolume(newVolume);
        volumeControl.value = newVolume;
    } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const newVolume = Math.max(0, currentVolume - 10);
        setVolume(newVolume);
        volumeControl.value = newVolume;
    }
});

// Auto-refresh online users
setInterval(() => {
    fetch('/api/users')
        .then(response => response.json())
        .then(users => {
            onlineCount.textContent = users.length;
        })
        .catch(error => console.error('Kullanıcı sayısı güncellenemedi:', error));
}, 30000);

// Handle page visibility change
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Page is hidden, could pause radio to save bandwidth
        // pauseRadio();
    } else {
        // Page is visible again
        // if (!isPlaying) playRadio();
    }
});

// Service Worker registration for PWA capabilities
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}