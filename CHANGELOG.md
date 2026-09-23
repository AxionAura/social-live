# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed
- **License**: MIT → **AGPL-3.0-or-later**. Copyleft protects the project from closed-source hosted forks: anyone modifying SocialLive and serving it over a network must publish their changes. Self-hosting (personal or commercial) is unaffected.

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

> Roadmap lives in the [README](README.md#-roadmap).