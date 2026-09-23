# Contributing to SocialLive

Thank you for contributing! This project welcomes contributions of all kinds — code, docs, tests, bug reports, feature ideas.

---

## Ways to Contribute

| Type | How |
|------|-----|
| **Bug reports** | Open a GitHub Issue with steps to reproduce |
| **Feature requests** | Open a GitHub Issue with use case |
| **Documentation** | Fix typos, add examples, translate |
| **Code** | Fork → branch → PR with tests |
| **Testing** | Run on unusual platforms (Termux, ARM, Windows) |

---

## Development Workflow

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/social-live.git`
3. **Create a branch**: `git checkout -b feat/amazing-feature`
4. **Make changes** with tests
5. **Verify**:
   ```bash
   npm run build
   npm test
   npm run typecheck
   ```
6. **Commit** with clear messages:
   ```
   feat(streaming): add Twitch platform adapter

   - Implements PlatformAdapter for Twitch ingest
   - Adds stream key validation (live_ prefix)
   - Includes unit and integration tests
   ```
7. **Push** and open a **Pull Request**

---

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit `any`
- **Tests required** for new features (unit + integration where applicable)
- **No console.log** in production code — use the logger
- **No shell interpolation** — ever (FFmpeg args via array)
- **Shared schemas** — validation lives in `@social-live/shared`
- **Accessibility** — semantic HTML, ARIA labels, keyboard navigation

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:
```
fix(auth): prevent session fixation on password change
feat(destinations): add RTMP connectivity test button
docs(installation): add Termux-specific FFmpeg preset guidance
test(streaming): add reconnect backoff verification
```

---

## Pull Request Checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes (all 40+ tests)
- [ ] `npm run typecheck` passes
- [ ] New code has tests
- [ ] Documentation updated (README, docs/, JSDoc)
- [ ] No new warnings in build output
- [ ] CHANGELOG.md updated (if user-facing change)

---

## Review Process

1. Automated checks run (build, test, typecheck)
2. Maintainer reviews code
3. Address feedback (push new commits to same branch)
4. Approve → merge (squash merge preferred)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold this code.

**Be respectful, inclusive, and constructive.** Harassment, trolling, or discriminatory behavior will not be tolerated.

---

## Security Issues

**Do not open public issues for security vulnerabilities.**

See `SECURITY.md` for responsible disclosure process.

---

## License

By contributing, you agree that your contributions will be licensed under the project's license (AGPL-3.0-or-later — see `LICENSE`).