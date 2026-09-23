# Developer Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React + MUI)                    │
│  Dashboard / Streams / Videos / Destinations / History / Settings│
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Server (Fastify)                       │
│  Auth / Videos / Destinations / Streams / Dashboard / System    │
│  EventBus (SSE) ◄─────────────────────────────────────────────► │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   SQLite     │ │  Scheduler  │ │ Stream Manager│
    │  (node:sqlite)│ │ (setInterval)│ │ (orchestrator)│
    └──────────────┘ └──────────────┘ └──────┬───────┘
                                             │
                                    ┌────────┴────────┐
                                    ▼                 ▼
                              ┌──────────┐      ┌──────────┐
                              │ FFmpeg   │      │ FFmpeg   │
                              │ (YouTube)│      │ (Facebook)│
                              └──────────┘      └──────────┘
```

## Monorepo Structure

```
social-live/
├── apps/
│   ├── server/          # Fastify API server
│   └── web/             # React + Vite dashboard
├── packages/
│   ├── shared/          # Types, constants, Zod schemas
│   ├── database/        # SQLite migrations + repos
│   └── streaming/       # FFmpeg process management
├── integrations/
│   ├── youtube/         # YouTube platform adapter
│   └── facebook/        # Facebook platform adapter
├── docker/              # Dockerfile, compose, Caddy
├── scripts/
│   └── social-live.mjs  # CLI utility
├── tests/
│   ├── unit/            # Pure unit tests
│   └── integration/     # Full API + streaming tests
└── docs/                # All documentation
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Node.js 22+ built-in SQLite** | No native modules — works on Termux, Windows, Alpine |
| **Fastify** | Low overhead, great TypeScript, plugin ecosystem |
| **Zod schemas shared** | Single source of truth for validation (server + client) |
| **FFmpeg via `spawn` array** | Command injection safe by design |
| **SSE for real-time** | Simpler than WebSockets, works over HTTP/2, auto-reconnect |
| **Per-destination FFmpeg process** | Isolation — one failure doesn't affect others |
| **Encryption at rest** | Credentials safe even if DB stolen |
| **No shell interpolation** | All user input goes through validated params |

---

## Development Setup

```bash
# 1. Clone
git clone https://github.com/your-org/social-live.git
cd social-live

# 2. Install
npm ci

# 3. Build all
npm run build

# 4. Run dev servers (two terminals)
npm run dev:server   # API on :3000
npm run dev:web      # Vite on :5173 (proxies /api to :3000)
```

---

## Running Tests

```bash
npm test              # Unit + integration
npm run test:unit     # Unit only
npm run test:integration # Integration only
npm run typecheck     # Strict TypeScript check
```

---

## Adding a New Platform (e.g., Twitch)

1. **Create adapter** in `integrations/twitch/src/index.ts`:

```typescript
import type { DestinationConfigInput, PlatformAdapter } from '@social-live/shared';

export const twitchAdapter: PlatformAdapter = {
  platform: 'twitch',
  label: 'Twitch',
  defaultIngestUrl: 'rtmps://ingest.twitch.tv/app/',
  keyHelpUrl: 'https://dashboard.twitch.tv/settings/stream',
  keyHelpText: 'Twitch Creator Dashboard → Settings → Stream → Primary Stream Key',
  validateConfig(config: DestinationConfigInput) {
    if (!config.streamKey?.startsWith('live_')) {
      return { ok: false, error: 'Twitch stream keys start with "live_"' };
    }
    return { ok: true };
  },
  buildOutputUrl(config: DestinationConfigInput): string {
    return `${config.streamUrl || this.defaultIngestUrl}${config.streamKey}`;
  },
};
```

2. **Register** in `packages/shared/src/constants.ts`:

```typescript
export const PLATFORMS = ['youtube', 'facebook', 'twitch'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<Platform, { ... }> = {
  youtube: { ... },
  facebook: { ... },
  twitch: { label: 'Twitch', defaultIngestUrl: 'rtmps://ingest.twitch.tv/app/', ... },
};
```

3. **Export** in `apps/server/src/app.ts`:

```typescript
import { twitchAdapter } from '@social-live/twitch';
// add to adapters record
```

4. **Add tests** for the new adapter
5. **Update docs** (`docs/platform-twitch.md`)

---

## Database Migrations

Migrations live in `packages/database/src/migrations.ts`. Each migration:

```typescript
{
  version: 2,
  sql: `ALTER TABLE videos ADD COLUMN new_field TEXT;`,
}
```

- Version numbers are sequential
- Runs automatically on server startup
- **Never modify applied migrations** — add new ones

---

## Event System (SSE)

Server publishes events via `EventBus`:

```typescript
bus.publish({ type: 'stream.started', data: stream });
```

Client subscribes via `useSSE` hook and invalidates React Query cache.

**Event types** (in `packages/shared/src/types.ts`):

```typescript
stream.created | stream.starting | stream.started | stream.status
stream.reconnecting | stream.error | stream.stopped | stream.completed
video.created | video.updated | video.deleted
destination.created | destination.updated | destination.deleted
```

---

## Code Style

- **ESLint**: not configured (TypeScript strict is the baseline)
- **Prettier**: not configured (consistent formatting via TS)
- **Naming**: camelCase for vars/functions, PascalCase for types/components
- **Imports**: absolute from workspace root (`@social-live/shared`)
- **Async**: always `await` — no unhandled promises

---

## Debugging Tips

| Task | Command |
|------|---------|
| View server logs | `tail -f data/logs/app.log` (if configured) |
| Inspect database | `sqlite3 data/database/app.db ".schema"` |
| Test FFmpeg args | `node -e "import {buildStreamArgs} from './packages/streaming/dist/args.js'; console.log(buildStreamArgs({...}))"` |
| SSE stream | `curl -N http://localhost:3000/api/events` (with cookie) |
| Decrypt key (dev) | `node -e "import {decryptString} from './apps/server/dist/lib/crypto.js'; console.log(decryptString(key, blob))"` |

---

## Performance Notes

- **Video upload**: streamed to disk via `pipeline()` — constant memory
- **FFmpeg metrics**: polled every 2s from stderr, persisted every 5s
- **SSE**: single connection per browser tab; heartbeat every 15s
- **React Query**: stale-while-revalidate, no refetch on focus
- **Database**: WAL mode, 5s busy timeout

---

## Release Process

1. Update version in `package.json` (root + all workspaces)
2. Update `CHANGELOG.md`
3. Run `npm run build && npm test`
4. Tag: `git tag v0.1.0 && git push --tags`
5. CI builds Docker image, publishes to registry
6. Update docs if needed