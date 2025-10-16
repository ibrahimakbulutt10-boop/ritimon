const socket = io();

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const emojiPanel = document.getElementById("emojiPanel");
const equalizer = document.getElementById("equalizer");
const onlineCount = document.getElementById("onlineCount");
const totalCount = document.getElementById("totalCount");
const currentTrack = document.getElementById("currentTrack");

let nickname = "";

function setNickname() {
  const input = document.getElementById("nicknameInput").value.trim();
  if (input) {
    nickname = input;
    document.querySelector(".login-panel").style.display = "none";
    socket.emit("user joined", nickname);
  }
}

function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg && nickname) {
    socket.emit("chat message", `${nickname}: ${msg}`);
    messageInput.value = "";
  } else if (!nickname) {
    alert("Lütfen önce bir nick girin.");
  }
}

socket.on("chat message", (msg) => {
  const p = document.createElement("p");
  p.textContent = msg;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on("track update", (track) => {
  currentTrack.textContent = track;
});

socket.on("onlineCount", (count) => {
  onlineCount.textContent = count;
});

socket.on("totalCount", (count) => {
  totalCount.textContent = count;
});

function updateTrack() {
  const newTrack = document.getElementById("trackInput").value.trim();
  if (newTrack) {
    currentTrack.textContent = newTrack;
    socket.emit("track update", newTrack);
  }
}

function toggle

