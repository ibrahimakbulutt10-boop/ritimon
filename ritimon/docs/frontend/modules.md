# Frontend Modules

This project uses multiple client modules in `public/`.

## main-chat.html (module script)
- Joins chat via Firebase (v9 modules)
- Functions: `joinChat()` and internal helpers to send/listen messages and users

## chat-stream.js
- Connects to Socket.IO, manages chat UI
- Public functions: `sendMessage()`, `addMessage(data)`, `addSystemMessage(text)`, `addAnnouncement(data)`, `addEmoji(emoji)`
- Context menu functions: `showContextMenu(event, userId, nickname)`, `hideContextMenu()`, `warnUser()`, `timeoutUser()`, `banUser()`, `muteUser()`, `viewProfile()`
- Auto-scroll and helpers: `scrollToBottom()`, `escapeHtml(text)`

## dj-stream.js
- DJ panel logic with Socket.IO
- Auth: `checkPassword()` (password = `4545`)
- Streaming controls: `startStream()`, `stopStream()`
- Announcements & now playing: `updateNowPlaying()`, `sendAnnouncement()`, `requestSong()`
- Playlist: `addToPlaylist()`, `clearPlaylist()`, `updatePlaylistDisplay()`, `removeFromPlaylist(index)`, `playNextSong()`
- Sound effects: `playSoundEffect(effect)`, `playCustomEffect()`
- Uploads: `initializeUpload()`, `uploadFiles(files)`, `uploadFile(file)`, `loadMusicLibrary()`, `updateMusicLibrary()`
- Library actions: `playMusic(path)`, `playMusicById(id)`, `addMusicToPlaylist(id)`, `deleteMusic(id)`, `addUploadedToPlaylist()`, `refreshLibrary()`
- Chat: `sendDJMessage()`, `sendQuickResponse(response)`, `toggleAutoScroll()`, `clearChat()`
- Moderation: `showContextMenu(...)`, `warnUser()`, `timeoutUser()`, `banUser()`, `muteUser()`, `viewProfile()`

## listener.js
- Radio player UI, Socket.IO consumers
- Player controls: `togglePlay()`, `playRadio()`, `pauseRadio()`
- Volume controls: `setVolume(value)`, `toggleVolume()`, `updateVolumeIcon()`
- Requests: `requestSong()`
- Helpers: `addChatMessage(data)`, `addSystemMessage(text)`, `addAnnouncement(data)`, `startProgressSimulation()`, `formatTime(s)`, `updateTimeDisplay()`, `updateDJDuration()`, `updateSongHistory()`, `updateStatistics()`, `loadStatistics()`

## app.js / chat.js / dj.js
- Legacy/simple Firebase-based demos; see inline code for usage.
