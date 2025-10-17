# Usage & Examples

## REST

### Get status
```bash
curl http://localhost:3000/api/status
```

### Upload audio (max 50MB)
```bash
curl -F "musicFile=@/path/to/song.mp3" http://localhost:3000/api/upload
```

## Socket.IO (browser)
```html
<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io();
  socket.emit('join', { nickname: 'Alice' });
  socket.emit('chat message', { text: 'Merhaba!', timestamp: new Date().toISOString() });
  socket.on('chat message', (msg) => console.log(msg));
</script>
```

### DJ flow
```js
socket.emit('dj login', { nickname: 'DJ Alice' });
socket.emit('dj play', { song: 'Song - Artist' });
socket.emit('dj announcement', { text: 'Hoş geldiniz!' });
```

## Frontend snippets

### Send chat message (chat-stream.js)
```js
sendMessage(); // reads from #messageInput and emits
```

### Start/stop stream (dj-stream.js)
```js
checkPassword();
startStream();
stopStream();
updateNowPlaying();
```

### Player controls (listener.js)
```js
togglePlay();
setVolume(75);
requestSong();
```