# REST API

Base URL: `/`

## GET /api/status
Returns current server status.

Response
```json
{
  "onlineUsers": 0,
  "activeDJs": 0,
  "currentSong": "Müzik yükleniyor...",
  "currentDJ": "DJ bekleniyor",
  "isLive": false,
  "uptime": 123
}
```

## POST /api/upload
Multipart form upload for audio files.
- Field: `musicFile` (audio/*)

Success Response
```json
{
  "success": true,
  "filename": "musicFile-1700000000000-123456789.mp3",
  "originalName": "file.mp3",
  "size": 12345,
  "path": "/absolute/path"
}
```

Error Response
```json
{ "error": "Dosya yüklenmedi" }
```

Notes:
- Max size 50MB
- Only audio mimetypes accepted
