const firebaseConfig = {
  apiKey: "AIzaSyDScnST7m9TrW67Fz-UYljEfUr9YZxBHF8",
  authDomain: "radyoapp-81787.firebaseapp.com",
  databaseURL: "https://radyoapp-81787-default-rtdb.firebaseio.com",
  projectId: "radyoapp-81787",
  storageBucket: "radyoapp-81787.firebasestorage.app",
  messagingSenderId: "788981302037",
  appId: "1:788981302037:web:778f82c0cfb6492c1a1f1c",
  measurementId: "G-3NLHLL0DGL"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const nickname = localStorage.getItem("nickname");

function sendMessage() {
  const msg = document.getElementById("messageInput").value;
  if (msg.trim() !== "") {
    db.ref("messages").push({ user: nickname, text: msg });
    document.getElementById("messageInput").value = "";
  }
}

db.ref("messages").on("child_added", snapshot => {
  const msg = snapshot.val();
  const div = document.createElement("div");
  div.textContent = `${msg.user}: ${msg.text}`;
  document.getElementById("messages").appendChild(div);
});

