# Configuration Reference

All configuration is via environment variables (or a `.env` file in the project root). The server loads them at startup — changes require a restart.

---

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` behind a reverse proxy. |
| `APP_PORT` | `3000` | HTTP port. |
| `APP_BASE_URL` | *(unset)* | Public origin (e.g. `https://stream.example.com`). Used for future OAuth callbacks. |

---

## Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | Root directory for database, videos, thumbnails, logs, keys. Must be writable by the node process. |
| `DATABASE_URL` | `sqlite:./data/database/app.db` | SQLite path. Format: `sqlite:/absolute/path` or `sqlite:relative/path`. PostgreSQL planned for future. |

**Directory layout under `DATA_DIR`:**

```
data/
├── database/
│   └── app.db              # SQLite database
├── videos/
│   └── <uuid>.mp4          # Uploaded video files
├── thumbnails/
│   └── <uuid>.jpg          # Generated thumbnails (640px wide)
├── logs/
│   └── *.log               # Application logs (stdout/stderr capture)
├── tmp/
│   └── upload-<uuid>.mp4   # Temporary uploads during processing
└── config/
    ├── session-secret.key  # Auto-generated if SESSION_SECRET unset
    └── encryption.key      # Auto-generated if ENCRYPTION_KEY unset — BACK THIS UP!
```

---

## FFmpeg

| Variable | Default | Description |
|----------|---------|-------------|
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Full path to FFmpeg binary. Example: `/usr/bin/ffmpeg` or `C:\ffmpeg\bin\ffmpeg.exe` |
| `FFPROBE_PATH` | `ffprobe` (PATH) | Full path to FFprobe binary. |
| `FFMPEG_PRESET` | `veryfast` | x264 speed preset: `ultrafast` … `veryslow`. Use `superfast`/`ultrafast` on weak CPUs (Termux, old laptops). |
| `VIDEO_BITRATE_KBPS` | `4500` | Target video bitrate (kbps). Lower for limited upload bandwidth. |
| `AUDIO_BITRATE_KBPS` | `128` | Target audio bitrate (kbps). |
| `VIDEO_FPS` | `30` | Output frame rate forced on the encoder. Kick rejects non-30/60 sessions; keep 30 (or 60) for live platforms. |

**Bitrate guidelines:**

| Upload bandwidth | Recommended `VIDEO_BITRATE_KBPS` | `FFMPEG_PRESET` |
|------------------|----------------------------------|-----------------|
| ≥ 10 Mbps | 6000–8000 | `veryfast` |
| 5–10 Mbps | 3500–5000 | `veryfast` |
| 2–5 Mbps | 2000–3000 | `superfast` |
| < 2 Mbps (mobile) | 1000–1500 | `ultrafast` |

---

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | *auto-generated* | Cookie signing secret. If unset, a random 96-char secret is generated and stored at `DATA_DIR/config/session-secret.key`. **Set this in production to keep sessions valid across restarts.** |
| `ENCRYPTION_KEY` | *auto-generated* | Master key for AES-256-GCM encryption of destination credentials. If unset, a random key is generated and stored at `DATA_DIR/config/encryption.key`. **BACK THIS UP — without it, stored stream keys cannot be recovered.** |
| `SESSION_TTL_HOURS` | `168` (7 days) | Session cookie lifetime. |
| `ALLOW_PRIVATE_RTMP_TARGETS` | `false` | **Dev/test only.** When `true`, allows streaming to private/loopback RTMP endpoints (e.g., `rtmp://127.0.0.1:1935/live`). Never enable in production. |

---

## Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_UPLOAD_SIZE` | `5368709120` (5 GB) | Maximum video upload size in bytes. |
| `MAX_CONCURRENT_STREAMS` | `4` | Max simultaneous active streams. |
| `MAX_RECONNECT_ATTEMPTS` | `5` | Retry count before giving up on a failed destination. |
| `RETRY_DELAYS` | `5,10,20,30,60` | Seconds between reconnect attempts (comma-separated). |

---

## Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |

---

## Example `.env` for Production

```env
# Server
APP_HOST=0.0.0.0
APP_PORT=3000
APP_BASE_URL=https://stream.example.com

# Storage
DATA_DIR=/opt/social-live/data

# Security (generate once, keep secret!)
SESSION_SECRET=your-96-char-hex-secret-here
ENCRYPTION_KEY=your-base64-or-passphrase-key-here

# FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
FFMPEG_PRESET=veryfast
VIDEO_BITRATE_KBPS=4500
AUDIO_BITRATE_KBPS=128

# Limits
MAX_UPLOAD_SIZE=5368709120
MAX_CONCURRENT_STREAMS=4

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

---

## Runtime Configuration (via Dashboard)

The following can be changed at runtime without restart via **Settings** page:

- Admin password
- Diagnostics re-run

The following require server restart:

- All `.env` variables
- FFmpeg path/version changes

---

## Backup-Critical Files

| File | Purpose | Backup Frequency |
|------|---------|------------------|
| `DATA_DIR/config/encryption.key` | Decrypts all stored stream keys | **Before every change**; off-site |
| `DATA_DIR/config/session-secret.key` | Validates existing sessions | With encryption key |
| `DATA_DIR/database/app.db` | All metadata (streams, videos, users) | Daily |
| `DATA_DIR/videos/` | Uploaded video files | As needed |
| `DATA_DIR/thumbnails/` | Generated thumbnails | Optional (regeneratable) |

> ⚠️ **Losing `encryption.key` means permanent loss of access to YouTube/Facebook stream keys.** Store it in a password manager or offline backup.