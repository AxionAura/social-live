# Troubleshooting

## FFmpeg Not Found

```
❌ FFmpeg
   FFmpeg not found
   💡 Install FFmpeg (e.g. apt install ffmpeg / pkg install ffmpeg / choco install ffmpeg) or set FFMPEG_PATH.
```

**Solutions:**
- **Linux**: `sudo apt install ffmpeg` / `sudo dnf install ffmpeg` / `sudo pacman -S ffmpeg`
- **macOS**: `brew install ffmpeg`
- **Windows**: Download from gyan.dev → extract → add `bin` to PATH
- **Termux**: `pkg install ffmpeg`
- **Custom path**: Set `FFMPEG_PATH=/full/path/to/ffmpeg` in `.env`
- Verify: `ffmpeg -version` should show version ≥ 6.0

---

## Port Already in Use

```
❌ Port
   Port 3000 is already in use
   💡 Stop the other process or set APP_PORT to a free port.
```

**Solutions:**
- `lsof -ti:3000 | xargs kill -9` (Linux/macOS)
- Change `APP_PORT=3001` in `.env`
- Check for another SocialLive instance or conflicting service

---

## Permission Errors

```
EACCES: permission denied, open '/data/database/app.db'
```

**Solutions:**
- Run as a user with write access to `DATA_DIR`
- `chown -R sociallive:sociallive /opt/social-live/data`
- In Docker: ensure volume mount has correct UID/GID (`user: "1000:1000"` in compose)

---

## Stream Connection Failed

```
Stream failed: Connection refused / Timeout / TLS handshake failed
```

**Checklist:**
1. **Outbound firewall**: Allow TCP 1935 (RTMP) and 443 (RTMPS)
2. **Destination test**: In dashboard, click **Test** on the destination
3. **Stream key**: Regenerate in YouTube Studio / Facebook Live Producer
4. **Ingest URL**: Ensure it's `rtmps://` (not `rtmp://`) for production
5. **Private targets**: `ALLOW_PRIVATE_RTMP_TARGETS` must be `false` (default) for public endpoints

**YouTube-specific:**
- Channel must be **verified** (phone)
- Live streaming enabled (24h wait after first enable)
- Try alternate ingest: `rtmps://b.rtmp.youtube.com/live2`

**Facebook-specific:**
- Use a **Page**, not personal profile
- Use **persistent** stream key (not one-time)
- Page must have Live Video permission

---

## YouTube Connection Error

| Error | Cause | Fix |
|-------|-------|-----|
| `403 Forbidden` | Channel not verified / live disabled | Verify channel; enable live streaming (wait 24h) |
| `Invalid stream key` | Key rotated / typo | Regenerate in YouTube Studio → Stream settings |
| `Bitrate too low` | Upload can't sustain bitrate | Lower `VIDEO_BITRATE_KBPS` or upgrade connection |
| `No video data` | FFmpeg encoding issue | Check FFmpeg has `libx264` + `aac`; check logs |

---

## Facebook Connection Error

| Error | Cause | Fix |
|-------|-------|-----|
| `Stream not found` | Using personal profile | Must use a Facebook Page |
| `Invalid stream key` | One-time key expired | Use persistent stream key from Live Producer |
| `403 Forbidden` | Page lacks permission | Page admin must grant Live Video permission |
| `Connection reset` | Network / firewall | Allow outbound TCP 443; check corporate proxy |

---

## Video Upload Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `413 Payload Too Large` | File > `MAX_UPLOAD_SIZE` | Increase `MAX_UPLOAD_SIZE` in `.env` or split video |
| `Unsupported file type` | Wrong extension/MIME | Use MP4/MOV/MKV with H.264 + AAC |
| `Signature check failed` | Not a valid video container | Re-encode with FFmpeg: `ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4` |
| `Could not read metadata` | Corrupt file / no video stream | `ffprobe input.mp4` should show video stream |
| Stuck at "Processing" | FFprobe crash / timeout | Check `FFPROBE_PATH`; ensure file < 5 GB |

---

## Stream Stops Unexpectedly

**Check Stream Detail → Logs for:**

| Log Pattern | Meaning |
|-------------|---------|
| `Network interruption` / `Connection reset` | Network instability → check upload stability |
| `Reconnecting (attempt N)` | Auto-reconnect in progress (exponential backoff) |
| `FFmpeg exited with code 1` | Encoding error → check FFmpeg version, input file |
| `bitrate=0` / `fps=0` | No data flowing → source file issue or bandwidth saturated |

**Common fixes:**
- Reduce `VIDEO_BITRATE_KBPS` and `FFMPEG_PRESET=superfast`
- Ensure no other heavy uploads running
- Use wired Ethernet
- Monitor `iftop` / `nethogs` for bandwidth usage

---

## Scheduled Stream Didn't Start

1. **Scheduler running?** Check server logs for `Scheduler starting scheduled stream`
2. **Time zone**: Server uses its local time (set `TZ` env var if needed)
3. **Past due?** Streams scheduled in the past are skipped
4. **Server was down?** Scheduler only runs while server is up

---

## Database Locked / Corrupt

```
sqlite: database is locked
```

**Causes:**
- Multiple SocialLive instances on same `DATA_DIR`
- Unclean shutdown during write

**Fix:**
```bash
# 1. Stop all instances
# 2. Check for stale lock files
rm -f data/database/app.db-wal data/database/app.db-shm
# 3. Run integrity check
sqlite3 data/database/app.db "PRAGMA integrity_check;"
# 4. Restart
```

---

## Encryption Key Lost

**Symptoms:**
- "Failed to decrypt destination credentials"
- Destinations show but stream key cannot be revealed
- Stream start fails with decryption error

**Recovery:**
- **If you have backup** of `DATA_DIR/config/encryption.key` → restore it, restart
- **No backup** → **impossible to recover** stream keys (by design)
  - Delete affected destinations in dashboard
  - Re-add with fresh stream keys from YouTube/Facebook

> ⚠️ This is why backing up `encryption.key` is critical.

---

## Low Performance / High CPU

| Symptom | Fix |
|---------|-----|
| CPU 100% on stream | Lower `VIDEO_BITRATE_KBPS`; set `FFMPEG_PRESET=ultrafast` |
| FFmpeg crashes OOM | Reduce concurrent streams (`MAX_CONCURRENT_STREAMS`); add swap |
| Termux: thermal throttling | `VIDEO_BITRATE_KBPS=1500`, `FFMPEG_PRESET=ultrafast`, keep device cool |

---

## Debug Mode

```bash
LOG_LEVEL=debug npm start
# Or:
LOG_LEVEL=debug social-live start
```

Produces verbose logs including:
- FFmpeg command lines
- SSE events
- Database queries
- Reconnect decisions

---

## Getting Help

1. **Check logs** in `DATA_DIR/logs/` or stream detail page
2. **Run diagnostics**: `social-live doctor` or Settings → Diagnostics
3. **Search issues** on GitHub
4. **Open new issue** with:
   - OS / Node / FFmpeg versions
   - `.env` (redact secrets!)
   - Relevant log snippets
   - Steps to reproduce