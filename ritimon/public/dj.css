const nickname = localStorage.getItem("nickname") || "DJ";
let stream;

function checkPassword() {
  const pass = document.getElementById("djpass").value;
  if (pass === "4545") {
    document.getElementById("djControls").style.display = "block";
  } else {
    alert("Şifre yanlış!");
  }
}

function startStream() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
    stream = s;
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.play();
    firebase.database().ref("stream").set({
      active: true,
      dj: nickname,
      timestamp: Date.now()
    });
  }).catch(err => {
    alert("Mikrofon erişimi reddedildi: " + err.message);
  });
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    firebase.database().ref("stream").set({
      active: false,
      dj: nickname,
      timestamp: Date.now()
    });
  }
}

