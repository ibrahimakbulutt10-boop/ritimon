# Socket.IO Events

Namespace: default (`io.on('connection')`)

## Client -> Server
- `join` { nickname }
- `chat message` { text, timestamp }
- `dj login` { nickname }
- `dj logout` { nickname }
- `dj play` { song }
- `dj stop`
- `dj announcement` { text }
- `warnUser` { targetNickname, reason }
- `muteUser` { targetNickname, duration, reason }
- `banUser` { targetNickname, reason }
- `typing` { nickname }
- `stopTyping` { nickname }
- `userAway`
- `userBack`

## Server -> Clients
- `userJoined` user
- `userLeft` user
- `userList` [user]
- `chat message` message
- `dj login` { nickname }
- `dj logout` { nickname }
- `now playing` { song, dj }
- `stop playing` { dj }
- `announcement` { dj, text, timestamp }
- `muted` { message }
- `banned` { message | reason }
- `userWarned` { targetNickname, djNickname, reason, warnings }
- `userMuted` { targetNickname, djNickname, duration, reason }
- `userBanned` { targetNickname, djNickname, reason }

## Message Shapes
```json
// user
{
  "id": "socketId",
  "nickname": "nick",
  "joinTime": "ISO",
  "isOnline": true,
  "isDJ": false,
  "warnings": 0
}
```

```json
// chat message
{
  "id": "socketId",
  "nickname": "nick",
  "text": "...",
  "timestamp": "ISO",
  "isDJ": false,
  "warnings": 0
}
```
