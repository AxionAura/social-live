# Installation Guide

## One-line installer (easiest)

```bash
curl -fsSL https://raw.githubusercontent.com/AxionAura/social-live/main/install.sh | bash
```

**Windows 10/11 (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/AxionAura/social-live/main/install.ps1 | iex
```

The script detects your OS and package manager, provisions Node.js (≥ 22.13) and
FFmpeg if missing (user-local runtime download — asks for sudo only when a system
package is the cleanest route), clones and builds SocialLive into `~/.social-live`,
writes a `.env`, registers a background service and prints the dashboard URL.

- Control command: `social-live start | stop | status | doctor | update`
- The service restarts on failure and starts at login (systemd user unit / launchd)
- Optional: `sudo loginctl enable-linger $USER` (Linux) keeps it running before login
- Remove everything: `curl -fsSL https://raw.githubusercontent.com/AxionAura/social-live/main/install.sh | bash -s -- --uninstall`

Flags: `--port N` (default 3000), `--dir PATH` (default `~/.social-live`),
`--no-service`, `--uninstall`. The script is readable and versioned in the repo —
inspect it before piping to bash.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | ≥ 22.13 | Required for built-in `node:sqlite` (no native modules) |
| **FFmpeg** | ≥ 6.0 | Must include `libx264`, `aac`, `rtmp` protocol |
| **FFprobe** | Same as FFmpeg | Usually bundled with FFmpeg |
| **Disk** | ≥ 2 GB free | Videos, database, logs, thumbnails |
| **RAM** | ≥ 512 MB | 1 GB+ recommended for concurrent streams |

---

## Linux (Debian/Ubuntu/Fedora/Arch)

```bash
# 1. Install Node.js 22+ (use nodesource or official binaries)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install FFmpeg
sudo apt-get install -y ffmpeg

# 3. Clone and build
git clone https://github.com/AxionAura/social-live.git
cd social-live
npm ci
npm run build

# 4. Setup and run
npm run cli setup
npm start
```

### systemd Service (for production)

```ini
# /etc/systemd/system/social-live.service
[Unit]
Description=SocialLive Streaming Platform
After=network.target

[Service]
Type=simple
User=sociallive
WorkingDirectory=/opt/social-live
Environment=DATA_DIR=/opt/social-live/data
Environment=NODE_ENV=production
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now social-live
```

---

## Windows

```powershell
# 1. Install Node.js 22+ from https://nodejs.org/
# 2. Install FFmpeg:
#    - Download from https://ffmpeg.org/download.html (gyan.dev full build)
#    - Extract to C:\ffmpeg
#    - Add C:\ffmpeg\bin to PATH (System → Environment Variables)

# 3. Clone and build
git clone https://github.com/AxionAura/social-live.git
cd social-live
npm ci
npm run build

# 4. Setup and run
npm run cli setup
npm start
```

### Run as Windows Service (NSSM)

```powershell
nssm install SocialLive "C:\Program Files\nodejs\node.exe" "C:\path\to\social-live\apps\server\dist\index.js"
nssm set SocialLive AppDirectory "C:\path\to\social-live"
nssm set SocialLive AppEnvironmentExtra "DATA_DIR=C:\path\to\social-live\data"
nssm set SocialLive AppEnvironmentExtra "NODE_ENV=production"
nssm start SocialLive
```

---

## macOS

```bash
# 1. Install Node.js 22+ (brew or official installer)
brew install node@22

# 2. Install FFmpeg
brew install ffmpeg

# 3. Clone and build
git clone https://github.com/AxionAura/social-live.git
cd social-live
npm ci
npm run build

# 4. Setup and run
npm run cli setup
npm start
```

### LaunchAgent (background on login)

```xml
<!-- ~/Library/LaunchAgents/com.sociallive.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sociallive</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/path/to/social-live/apps/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/social-live</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DATA_DIR</key><string>/path/to/social-live/data</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.sociallive.plist
```

---

## Android / Termux

```bash
# 1. Install Termux from F-Droid (Play Store version is outdated)
# 2. In Termux:
pkg update && pkg upgrade
pkg install nodejs ffmpeg git

# 3. Clone and build
git clone https://github.com/AxionAura/social-live.git
cd social-live
npm ci
npm run build

# 4. Setup and run
npm run cli setup
npm start

# Open http://localhost:3000 in Chrome on the same device
```

**Notes for Termux:**
- Lower `VIDEO_BITRATE_KBPS=2500` and `FFMPEG_PRESET=superfast` in `.env` for better performance
- Keep screen awake: `termux-wake-lock`
- Allow storage access: `termux-setup-storage`

---

## Docker (Linux / Windows / macOS)

```bash
# 1. Clone
git clone https://github.com/AxionAura/social-live.git
cd social-live

# 2. Configure
cp .env.example .env
# Edit .env (at minimum: SESSION_SECRET, ENCRYPTION_KEY)

# 3. Build and run
docker compose -f docker/docker-compose.yml up -d

# 4. View logs
docker compose -f docker/docker-compose.yml logs -f
```

### Production with HTTPS (Caddy reverse proxy)

```bash
# 1. Uncomment the caddy service in docker-compose.yml
# 2. Edit docker/caddy/Caddyfile with your domain
# 3. Start
docker compose -f docker/docker-compose.yml --profile proxy up -d
```

---

## VPS / Dedicated Server

1. **Provision** a VM with ≥ 1 vCPU, 1 GB RAM, 20 GB disk
2. **Install** via Linux instructions above (systemd recommended)
3. **Configure DNS** → point your domain to the VPS IP
4. **Enable HTTPS** via Caddy or Nginx + Certbot
5. **Set** `ALLOW_PRIVATE_RTMP_TARGETS=false` (default)
6. **Back up** `/opt/social-live/data` regularly (see Backup section)

---

## Verifying Installation

```bash
# Health check
curl http://localhost:3000/health
# → {"status":"ok","name":"SocialLive","version":"0.1.0"}

# Diagnostics
npm run cli doctor
# Or: social-live doctor
```

Expected output:
```
🩺 SocialLive Diagnostics

  Name:      SocialLive 0.1.0
  Node:      22.13.0
  Platform:  linux x64
  Data dir:  /opt/social-live/data
  FFmpeg:    /usr/bin/ffmpeg (version 8.1.2)
  FFprobe:   /usr/bin/ffprobe
  HTTPS:     no (dev)

  ✅ Runtime
      Node.js 22.13.0 (linux/x64)
  ✅ Database
      SQLite at /opt/social-live/data/database/app.db
  ✅ FFmpeg
      /usr/bin/ffmpeg (version 8.1.2)
  ✅ FFprobe
      /usr/bin/ffprobe
  ✅ Storage
      /opt/social-live/data is writable
  ✅ Encryption
      Master encryption key loaded (credentials are encrypted at rest)
      💡 Back up DATA_DIR/config/encryption.key — without it stored credentials cannot be recovered.

All checks passed. Ready to stream!
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| `ffmpeg: not found` | Install FFmpeg or set `FFMPEG_PATH` in `.env` |
| `EADDRINUSE` on port 3000 | Change `APP_PORT` or stop conflicting process |
| `sqlite: database is locked` | Ensure only one SocialLive instance uses the data dir |
| `ENCRYPTION_KEY` missing | One is auto-generated; back up `DATA_DIR/config/encryption.key` |
| Videos upload but won't play | Check FFmpeg has `libx264`/`aac` (`ffmpeg -codecs \| grep -E "264|aac"`) |

---

## Upgrading

```bash
cd /path/to/social-live
git pull
npm ci
npm run build
# Restart service (systemd: systemctl restart social-live)
```

Database migrations run automatically on startup.

---

## Uninstalling

```bash
# Stop service
systemctl stop social-live  # or: npm run cli stop

# Remove data (⚠️ deletes all videos, credentials, history)
rm -rf /path/to/social-live/data

# Remove code
rm -rf /path/to/social-live
```