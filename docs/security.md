# Security Model

## Threat Model

SocialLive is designed for **self-hosted** deployments where the operator has full control over the infrastructure. The threat model assumes:

| Trusted | Untrusted |
|---------|-----------|
| Server OS, filesystem, network | User-uploaded video files |
| Admin account (sole operator) | Destination RTMP endpoints (YouTube/Facebook) |
| FFmpeg binary | Browser clients (XSS, CSRF) |
| Node.js runtime | External DNS resolution |

---

## Defense in Depth

### 1. Credential Encryption at Rest

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: scrypt (N=16384, r=8, p=1) from `ENCRYPTION_KEY` env var
- **Storage**: `DATA_DIR/config/encryption.key` (600 perms)
- **Scope**: All destination stream keys + ingest URLs
- **Rotation**: Not supported in V1 — backup the key!

### 2. Stream Key Protection

- Never logged (redacted in FFmpeg stderr capture)
- Never in browser localStorage/sessionStorage
- Never in API responses (masked in destination DTO)
- Never in error messages or audit logs
- Reveal endpoint: rate-limited (6/min), audited, requires auth

### 3. SSRF Prevention

- Only `rtmp://` and `rtmps://` protocols allowed
- Hostname validation: blocks `localhost`, `.local`, `.internal`, `.lan`
- IP validation: blocks RFC1918, loopback, link-local, multicast, CGNAT
- DNS resolution: all A/AAAA records checked against private ranges
- Bypass: `ALLOW_PRIVATE_RTMP_TARGETS=true` (dev only, never in prod)

### 4. Command Injection Prevention

- FFmpeg arguments passed as **array to `spawn()`** — never shell interpolation
- User input (video path, stream key, URL) validated before use
- Video paths: generated UUID + extension, never user-controlled
- Stream keys: charset restricted `[A-Za-z0-9_\-=/+.]+`

### 5. File System Security

- Uploaded filenames: sanitized (no path traversal, no special chars)
- Storage paths: UUID-based, never user-controlled
- `DATA_DIR` boundaries enforced (no `../` escape)
- Thumbnail generation: fixed output path under `DATA_DIR/thumbnails/`

### 6. Authentication & Session Security

- Password hashing: scrypt (N=16384, r=8, p=1, 64-byte output)
- Sessions: signed HttpOnly cookies, SameSite=Lax, Secure in production
- Session TTL: configurable (default 7 days)
- Brute-force protection: 5 failures → 15 min lockout per IP+username
- Password change: revokes all other sessions

### 7. API Security

- Rate limiting: global 300/min + per-endpoint limits (auth, stream start/stop, destinations)
- Input validation: Zod schemas on all mutating endpoints
- Request size limits: 1 MB JSON, `MAX_UPLOAD_SIZE` for multipart
- CORS: disabled (same-origin only via cookie auth)

### 8. Security Headers (Production)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
Strict-Transport-Security: max-age=15552000 (HSTS)
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
X-Frame-Options: DENY
```

---

## Data Flow Security

```
┌─────────────┐     HTTPS      ┌─────────────┐
│   Browser   │ ◄─────────────► │    API      │
│  (Dashboard)│  Cookie auth   │  (Fastify)  │
└─────────────┘                └──────┬──────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐      ┌──────────┐      ┌──────────┐
              │ SQLite   │      │  FFmpeg  │      │  RTMPS   │
              │ (encrypted│      │ (spawn,  │      │ (YouTube/│
              │  creds)  │      │  no shell)│      │ Facebook)│
              └──────────┘      └──────────┘      └──────────┘
```

---

## Known Limitations (V1)

| Area | Limitation | Mitigation |
|------|------------|------------|
| **Single user** | No multi-user isolation | Run separate instances per user |
| **Manual stream keys** | Keys visible in YouTube/Facebook UI | Rotate keys periodically |
| **No TLS termination** | Requires reverse proxy (Caddy/Nginx) | Use provided Docker Compose + Caddy |
| **Key rotation** | Not automated | Manual process documented |
| **Audit log** | Local only, no tamper-proofing | Ship logs to external SIEM |

---

## Secure Deployment Checklist

- [ ] `SESSION_SECRET` set in `.env` (not auto-generated)
- [ ] `ENCRYPTION_KEY` set in `.env` and **backed up offline**
- [ ] `ALLOW_PRIVATE_RTMP_TARGETS=false` (default)
- [ ] Reverse proxy with HTTPS (Caddy/Nginx + Certbot)
- [ ] `LOG_LEVEL=info` or `warn` (not `debug`)
- [ ] `DATA_DIR` on encrypted volume
- [ ] Regular backups of `encryption.key`, `app.db`, videos
- [ ] Firewall: only 80/443 inbound; outbound 1935/443 to streaming platforms
- [ ] FFmpeg from trusted source (distro package, not random binary)
- [ ] Node.js updated regularly (security patches)

---

## Incident Response

1. **Credential leak suspected**: Rotate `ENCRYPTION_KEY` (requires re-adding all destinations), revoke all sessions
2. **Stream key compromised**: Regenerate in YouTube/Facebook, update destination in SocialLive
3. **Unauthorized access**: Check audit log (`/api/audit`), rotate `SESSION_SECRET`, revoke sessions
4. **SSRF bypass attempt**: Check logs for `InvalidStreamTargetError` — indicates probe

---

## Reporting Security Issues

See `SECURITY.md` for responsible disclosure process.