// Chat Stream JavaScript - Enhanced with Socket.io
const socket = io();
const nickname = localStorage.getItem('nickname') || 'Anonim';
let selectedTextColor = '#ffffff';
let selectedNickColor = '#4ecdc4';
let isBold = false;
let isItalic = false;
let onlineUsers = new Set();

// Radio Stream Configuration
const RADIO_STREAM_URL = 'https://ritimon.radiostream321.com';
const radioAudio = new Audio(RADIO_STREAM_URL);
radioAudio.volume = 0.5;
let isRadioPlaying = false;

// Radio Player Functions
function toggleRadio() {
    const playBtn = document.getElementById('radioPlayBtn');
    
    if (!isRadioPlaying) {
        radioAudio.play().then(() => {
            isRadioPlaying = true;
            playBtn.textContent = '⏸️ Radyoyu Kapat';
            playBtn.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a52)';
            addSystemMessage('📡 Radyo yayını başlatıldı');
        }).catch(error => {
            console.error('Radyo çalma hatası:', error);
            alert('Radyo başlatılamadı. Lütfen tarayıcınızı kontrol edin.');
        });
    } else {
        radioAudio.pause();
        isRadioPlaying = false;
        playBtn.textContent = '▶️ Radyoyu Aç';
        playBtn.style.background = 'linear-gradient(45deg, #ff4081, #ff6ec7)';
        addSystemMessage('📡 Radyo yayını durduruldu');
    }
}

function setRadioVolume(value) {
    radioAudio.volume = value / 100;
}

// Make functions globally available
window.toggleRadio = toggleRadio;
window.setRadioVolume = setRadioVolume;

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const userCount = document.getElementById('userCount');
const userList = document.getElementById('userList');
const currentSong = document.getElementById('currentSong');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Join chat with nickname
    socket.emit('join', { nickname });
    
    // Focus on message input
    messageInput.focus();
    
    // Load online users
    updateUserList();

    // Styling controls if present
    const nickPicker = document.getElementById('nickColorPicker');
    const textPicker = document.getElementById('textColorPicker');
    const boldToggle = document.getElementById('boldToggle');
    const italicToggle = document.getElementById('italicToggle');
    const djToggleBtn = document.getElementById('toggleDJPanelBtn');
    const djPanel = document.getElementById('djPanel');
    if (nickPicker) nickPicker.addEventListener('input', e => selectedNickColor = e.target.value);
    if (textPicker) textPicker.addEventListener('input', e => selectedTextColor = e.target.value);
    if (boldToggle) boldToggle.addEventListener('change', e => isBold = e.target.checked);
    if (italicToggle) italicToggle.addEventListener('change', e => isItalic = e.target.checked);
    if (djToggleBtn && djPanel) djToggleBtn.addEventListener('click', () => {
        djPanel.style.display = djPanel.style.display === 'none' ? 'block' : 'none';
    });
});

// Socket Events
socket.on('connect', () => {
    console.log('Bağlandı:', socket.id);
    addSystemMessage('✅ Sunucuya bağlandınız');
});

socket.on('disconnect', () => {
    addSystemMessage('❌ Sunucu bağlantısı kesildi');
});

socket.on('userJoined', (data) => {
    onlineUsers.add(data.nickname);
    addSystemMessage(`👋 ${data.nickname} sohbete katıldı`);
    updateUserList();
});

socket.on('userLeft', (data) => {
    onlineUsers.delete(data.nickname);
    addSystemMessage(`👋 ${data.nickname} sohbeti terk etti`);
    updateUserList();
});

socket.on('chat message', (data) => {
    addMessage(data);
});

socket.on('activeDJ', (data) => {
    addSystemMessage(`🎙️ DJ ${data} yayına başladı!`);
});

socket.on('now playing', (data) => {
    currentSong.textContent = `🎵 Şu anda çalan: ${data.song} - DJ ${data.dj}`;
    addSystemMessage(`🎵 DJ ${data.dj}: "${data.song}" çalıyor`);
});

socket.on('stop playing', (data) => {
    currentSong.textContent = '🎵 Şu anda çalan: Yayın yok';
    addSystemMessage(`🎙️ DJ ${data} yayını durdurdu`);
});

socket.on('announcement', (data) => {
    addAnnouncement(data);
});

// Message Functions
function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;
    
    if (message.length > 200) {
        alert('Mesaj 200 karakterden uzun olamaz!');
        return;
    }
    
    // Check for commands
    if (message.startsWith('/')) {
        handleCommand(message);
        messageInput.value = '';
        return;
    }
    
    const messageData = {
        nickname: nickname,
        text: message,
        timestamp: new Date().toISOString(),
        textColor: selectedTextColor,
        nickColor: selectedNickColor,
        bold: isBold,
        italic: isItalic
    };
    
    socket.emit('chat message', messageData);
    messageInput.value = '';
    
    // Add to local chat immediately for better UX
    messageData.isOwn = true;
    addMessage(messageData);
}

function addMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.isOwn ? 'own' : ''} ${data.isDJ ? 'dj-message' : ''}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Add right-click context menu for non-own messages
    const rightClickHandler = data.isOwn ? '' : `oncontextmenu="showContextMenu(event, '${data.id}', '${data.nickname}')"`;
    
    const nickStyle = `color:${data.nickColor || '#4ecdc4'};${data.bold ? 'font-weight:700;' : ''}${data.italic ? 'font-style:italic;' : ''}`;
    const textStyle = `color:${data.textColor || '#ffffff'};${data.bold ? 'font-weight:700;' : ''}${data.italic ? 'font-style:italic;' : ''}`;
    messageDiv.innerHTML = `
        <div class="message-info" ${rightClickHandler}>
            <strong style="${nickStyle}">${escapeHtml(data.nickname)}</strong> • ${time}
            ${data.isDJ ? '<span class="dj-badge">🎙️ DJ</span>' : ''}
            ${data.warnings > 0 ? `<span class="warning-badge">⚠️ ${data.warnings}</span>` : ''}
        </div>
        <div class="message-content">
            <div class="message-text" style="${textStyle}">${escapeHtml(data.text)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">${text}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function addAnnouncement(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message announcement';
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">📢 ${data.dj} duyuruyor: ${escapeHtml(data.text)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function handleCommand(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    
    switch (cmd) {
        case '/help':
            addSystemMessage('📋 Komutlar: /help, /clear, /users, /time');
            break;
        case '/clear':
            messagesContainer.innerHTML = '';
            addSystemMessage('🗑️ Chat temizlendi');
            break;
        case '/users':
            const userListText = Array.from(onlineUsers).join(', ');
            addSystemMessage(`👥 Çevrimiçi kullanıcılar: ${userListText}`);
            break;
        case '/time':
            const now = new Date().toLocaleString('tr-TR');
            addSystemMessage(`🕐 Şu anki zaman: ${now}`);
            break;
        case '/dj':
            if (parts.length > 1) {
                const song = parts.slice(1).join(' ');
                socket.emit('dj play', { dj: nickname, song: song });
            } else {
                addSystemMessage('Kullanım: /dj <şarkı adı>');
            }
            break;
        default:
            addSystemMessage(`❌ Bilinmeyen komut: ${cmd}. /help yazarak yardım alabilirsiniz.`);
    }
}

function updateUserList() {
    userCount.textContent = onlineUsers.size;
    
    userList.innerHTML = '';
    onlineUsers.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div class="user-avatar">${user.charAt(0).toUpperCase()}</div>
            <span>${user}</span>
        `;
        userList.appendChild(userDiv);
    });
}

function addEmoji(emoji) {
    messageInput.value += emoji;
    messageInput.focus();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event Listeners
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('input', function() {
    const remaining = 200 - this.value.length;
    if (remaining < 50) {
        this.style.borderColor = remaining < 10 ? '#ff4081' : '#ffc107';
    } else {
        this.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }
});

// Auto-scroll to bottom when new messages arrive
const observer = new MutationObserver(() => {
    scrollToBottom();
});

observer.observe(messagesContainer, {
    childList: true
});

// Handle page visibility change
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        socket.emit('userAway');
    } else {
        socket.emit('userBack');
    }
});

// Context Menu Functions
let selectedUser = null;

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

function toggleBanUser() {
    if (!selectedUser) return;
    const reason = prompt('Ban/Unban için neden (isteğe bağlı):', '');
    socket.emit('toggleBan', { targetNickname: selectedUser.nickname, reason });
    hideContextMenu();
}

function warnUser() {
    if (!selectedUser) return;
    
    const reason = prompt(`Uyarı nedeni (${selectedUser.nickname}):`);
    if (reason !== null) {
        addSystemMessage(`⚠️ ${selectedUser.nickname} uyarıldı: ${reason}`);
    }
    hideContextMenu();
}

function timeoutUser() {
    if (!selectedUser) return;
    
    const duration = prompt(`${selectedUser.nickname} için yasak süresi (dakika):`, '5');
    if (duration !== null && !isNaN(duration)) {
        const reason = prompt('Yasak nedeni:');
        addSystemMessage(`⏰ ${selectedUser.nickname} ${duration} dakika yasaklandı`);
    }
    hideContextMenu();
}

function banUser() {
    if (!selectedUser) return;
    
    if (confirm(`${selectedUser.nickname} kullanıcısını kalıcı olarak yasaklamak istediğinizden emin misiniz?`)) {
        const reason = prompt('Yasak nedeni:');
        addSystemMessage(`🚫 ${selectedUser.nickname} kalıcı olarak yasaklandı`);
    }
    hideContextMenu();
}

function muteUser() {
    if (!selectedUser) return;
    
    const duration = prompt(`${selectedUser.nickname} için susturma süresi (dakika):`, '5');
    if (duration !== null && !isNaN(duration)) {
        addSystemMessage(`🔇 ${selectedUser.nickname} ${duration} dakika susturuldu`);
    }
    hideContextMenu();
}

function viewProfile() {
    if (!selectedUser) return;
    
    alert(`👤 Kullanıcı Profili:
    
Ad: ${selectedUser.nickname}
ID: ${selectedUser.userId}
Durum: Çevrimiçi`);
    hideContextMenu();
}

// Socket events for moderation
socket.on('userWarned', (data) => {
    addSystemMessage(`⚠️ ${data.targetNickname} uyarıldı (${data.warningCount} uyarı) - ${data.reason}`);
});

socket.on('userMuted', (data) => {
    addSystemMessage(`🔇 ${data.targetNickname} ${data.duration} dakika susturuldu - ${data.reason}`);
});

socket.on('userBanned', (data) => {
    addSystemMessage(`🚫 ${data.targetNickname} kalıcı olarak yasaklandı - ${data.reason}`);
});

// Handle beforeunload
window.addEventListener('beforeunload', function() {
    socket.emit('leave', { nickname });
});
