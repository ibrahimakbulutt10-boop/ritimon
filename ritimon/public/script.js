const socket = io();

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const emojiPanel = document.getElementById("emojiPanel");
const equalizer = document.getElementById("equalizer");
const onlineCount = document.getElementById("onlineCount");
const totalCount = document.getElementById("totalCount");
const currentTrack = document.getElementById("currentTrack");

let nickname = "";

// Nick girildiğinde giriş panelini gizle
function setNickname() {
  const input = document.getElementById("nicknameInput").value.trim();
  if (input) {
    nickname = input;
    document.querySelector(".login-panel").style.display = "none";
    socket.emit("user joined", nickname);
  } else {
    alert("Lütfen bir nick girin.");
  }
}

// Mesaj gönderme
function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg && nickname) {
    socket.emit("chat message", `${nickname}: ${msg}`);
    messageInput.value = "";
  } else if (!nickname) {
    alert("Lütfen önce bir nick girin.");
  }
}

// Enter tuşuyla mesaj gönder
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Emoji panelinden emoji ekle
emojiPanel.addEventListener("click", (e) => {
  if (e.target.textContent) {
    messageInput.value += e.target.textContent;
    messageInput.focus();
  }
});

// Emoji panelini aç/kapat
function toggleEmoji() {
  emojiPanel.style.display = emojiPanel.style.display === "none" ? "block" : "none";
}

// Ses efekti (equalizer) aç/kapat
function toggleSound() {
  equalizer.style.display = equalizer.style.display === "none" ? "block" : "none";
}

// Tema değiştir
function toggleTheme() {
  document.body.classList.toggle("dark-theme");
}

// Yazı tipi değiştir
function toggleFont() {
  document.body.classList.toggle("alt-font");
}

// Yazı boyutu değiştir
function toggleSize() {
  document.body.classList.toggle("large-text");
}

// DJ şarkı güncelle
function updateTrack() {
  const newTrack = document.getElementById("trackInput").value.trim();
  if (newTrack) {
    currentTrack.textContent = newTrack;
    socket.emit("track update", newTrack);
  }
}

// Gelen mesajları göster
socket.on("chat message", (msg) => {
  const p = document.createElement("p");
  p.textContent = msg;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// Şarkı güncellemesini al
socket.on("track update", (track) => {
  currentTrack.textContent = track;
});

// Kullanıcı sayıları
socket.on("onlineCount", (count) => {
  onlineCount.textContent = count;
});

socket.on("totalCount", (count) => {
  totalCount.textContent = count;
});

function updateTrack() {
  const input = document.getElementById("trackInput").value.trim();
  if (input) {
    currentTrack.textContent = input;
    socket.emit("track update", input);

    // YouTube URL ise iframe ile göster
    if (input.includes("youtube.com") || input.includes("youtu.be")) {
      const embed = document.createElement("iframe");
      embed.src = convertToEmbedURL(input);
      embed.width = "100%";
      embed.height = "200";
      embed.allow = "autoplay";
      document.querySelector(".dj-panel").appendChild(embed);
    }
  }
}

function convertToEmbedURL(url) {
  if (url.includes("watch?v=")) {
    return url.replace("watch?v=", "embed/");
  } else if (url.includes("youtu.be")) {
    const id = url.split("/").pop();
    return `https://www.youtube.com/embed/${id}`;
  }
  return url;
}

function handleDrop(e) {
  e.preventDefault();
  const files = e.dataTransfer.files;
  const list = document.getElementById("fileList");
  for (let i = 0; i < files.length && i < 50; i++) {
    const li = document.createElement("li");
    li.textContent = `🎵 ${files[i].name}`;
    list.appendChild(li);
  }
}


