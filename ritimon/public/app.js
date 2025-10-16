// Firebase yapılandırması
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Sohbete giriş
const nicknameInput = document.getElementById("nickname");
const colorInput = document.getElementById("nick-color");
const enterChatBtn = document.getElementById("enter-chat");

enterChatBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value.trim();
  const color = colorInput.value;
  if (!nickname) return alert("Takma ad girin.");

  // Nick ve renk bilgisi localStorage ile aktarılır
  localStorage.setItem("nickname", nickname);
  localStorage.setItem("nickColor", color);

  window.location.href = "/chat.html";
});

// DJ listesi dinamik olarak yüklenir
db.ref("djs").on("child_added", (snapshot) => {
  const dj = snapshot.val();
  const card = document.createElement("div");
  card.classList.add("dj-card");

  const avatar = document.createElement("img");
  avatar.src = dj.avatar;

  const info = document.createElement("div");
  info.innerHTML = `<strong>${dj.name}</strong><br><em>${dj.song}</em>`;

  card.appendChild(avatar);
  card.appendChild(info);
  document.getElementById("dj-cards").appendChild(card);

  // Ana sayfadaki “şu an yayında” alanını güncelle
  document.getElementById("dj-name").textContent = dj.name;
  document.getElementById("song-title").textContent = dj.song;
});

