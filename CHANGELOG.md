# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-09-23

### Added
- **Core streaming engine**: FFmpeg process management with auto-reconnect, exponential backoff, and progress parsing
- **YouTube Live support**: Manual stream key mode with ingest URL configuration
- **Facebook Live support**: Persistent stream key mode
- **Multi-destination streaming**: Single video → multiple platforms simultaneously, independent FFmpeg processes
- **Browser dashboard**: React 19 + Material UI 7, light/dark/system theme, responsive
- **Video library**: Upload (drag & drop), validation (signature + ffprobe), thumbnails, search, rename, delete
- **Stream wizard**: 5-step guided creation (video → destinations → config → review → start)
- **Scheduled streams**: Background scheduler, works without browser open
- **Loop modes**: None / Repeat N times / Infinite
- **Real-time monitoring**: FPS, bitrate, duration, reconnect count per destination
- **Stream logs**: FFmpeg output captured and redacted (stream keys masked)
- **History page**: Filterable log of all completed/failed streams
- **Local authentication**: First-run admin setup, secure sessions, password change
- **Encryption at rest**: AES-256-GCM for destination credentials, scrypt for passwords
- **SSRF protection**: Private IP/hostname blocking, DNS resolution validation
- **Diagnostics CLI**: `social-live doctor` — checks Node, FFmpeg, DB, storage, port, encryption
- **Docker support**: Multi-stage build, docker-compose, Caddy reverse proxy config
- **Termux/Android support**: Documented setup, low-bitrate presets
- **Comprehensive test suite**: 41 tests (unit + integration) including full streaming E2E
- **Full documentation**: Installation, configuration, platform guides, usage, troubleshooting, security, developer guide

### Security
- Stream keys never logged, never in browser storage, never in API responses
- AES-256-GCM encryption at rest with master key from environment
- scrypt password hashing (N=16384)
- Rate limiting on sensitive endpoints
- Secure cookies (HttpOnly, SameSite, signed)
- Security headers (CSP, HSTS, etc.) in production

---

## [Unreleased]

### Planned for v1.1
- Better scheduler UI (recurring schedules, timezone picker)
- Stream thumbnails in history
- Richer live metrics (buffer health, dropped frames)
- Email/webhook notifications on stream events
- More diagnostics (disk space, network quality)

### Planned for v2.0
- Twitch support
- TikTok Live support
- OAuth flows for YouTube/Facebook (manage metadata from dashboard)
- Advanced platform APIs (stream health, chat)

### Planned for v3.0
- Webcam / screen capture input
- Scene editor (OBS-style)
- Overlays, watermarks, text, logos
- Audio mixer

### Planned for v4.0
- Multi-user support
- Team workspaces
- RBAC
- Remote workers / distributed streaming