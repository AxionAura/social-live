# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report via:

1. **Email**: security@sociallive.example.com (replace with actual)
2. **GitHub Security Advisories**: Use the "Report a vulnerability" tab in the repository

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a fix timeline.

---

## Disclosure Policy

- We follow **coordinated disclosure**
- Fixes are released as soon as practicable
- Credit given to reporters (unless anonymity requested)
- CVE requested for significant issues

---

## Security Architecture Summary

See `docs/security.md` for the full threat model, defense-in-depth layers, and secure deployment checklist.

Key guarantees:
- **No mandatory cloud services** — fully self-hosted
- **Credentials encrypted at rest** — AES-256-GCM
- **Stream keys never logged** — redacted in all outputs
- **SSRF protection** — private IP/hostname blocking by default
- **Command injection safe** — FFmpeg via `spawn` array, never shell
- **Audit trail** — security events logged

---

## Known Limitations

| Limitation | Status |
|------------|--------|
| Single-user only | V1 scope — multi-user planned for v4 |
| Manual stream keys | OAuth/API planned for v2 |
| No built-in TLS | Use reverse proxy (Caddy/Nginx) |
| Key rotation manual | Automated rotation planned |

---

## Contact

For security questions: security@sociallive.example.com