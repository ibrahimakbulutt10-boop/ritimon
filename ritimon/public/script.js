const socket = io();

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const emojiPanel = document.getElementById("emojiPanel");
const equalizer = document.getElementById("equalizer");
const onlineCount = document.getElementById("onlineCount");
const totalCount = document.getElementById("totalCount");
const currentTrack = document.getElementById("currentTrack");

function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg) {
    socket.emit("chat message", msg);
    messageInput.value = "";
  }
}

socket.on("chat message", (msg) => {
  const p = document.createElement("p");
  p.textContent = msg;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
});

function toggleEmoji() {
  emojiPanel.style.display = emojiPanel.style.display === "none" ? "block" : "none";
}

function toggleSound() {
  equalizer.style.display = equalizer.style.display === "none" ? "block" : "none";
}

function toggleTheme() {
  document.body.classList.toggle("dark-theme");
}

function toggleFont() {
  document.body.classList.toggle("alt-font");
}

function toggleSize() {
  document.body.classList.toggle("large-text");
}

emojiPanel.addEventListener("click", (e) => {
  if (e.target.textContent) {
    messageInput.value += e.target.textContent;
    messageInput.focus();
  }
});

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

