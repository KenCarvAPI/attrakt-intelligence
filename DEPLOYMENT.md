# Deployment Guide

How Attrakt Intelligence is deployed for production, the env-var checklist, CI,
and the backup/restore approach.

## Topology

| Component | Host | Notes |
|-----------|------|-------|
| Admin dashboard (`apps/admin`, Next.js) | **Vercel** | Server components hit Postgres directly; static + SSR. |
| API server (`packages/api`) | **Railway** | Express: health, Bull-Board, brief/knowledge/campaign routes; boots the metrics scheduler + worker. |
| Workers & bots (`packages/mcp-servers`) | **Railway** | Discord bot + worker, GitHub webhook + worker, Discourse polling + worker. |
| Agents (`packages/agents`) | **Railway** | Pulse (weekly digest) and scoring/brief workers. |
| Postgres | **Railway managed Postgres** (plain) | TimescaleDB is **deferred** — hypertable lines stay commented; tables run as plain Postgres. |
| Redis | **Upstash** | BullMQ transport. |

**Why Railway for the backend:** it runs several long-lived services + cron from
one repo with managed Postgres, minimal ops, and good DX — the right trade for an
MVP. (Alternatives: Render or Fly.io would also work; Railway wins on setup
speed.) The admin app goes to Vercel because it is a Next.js app and Vercel is the
lowest-friction host for it.

> Out of scope for MVP and **not deployed**: Twitter ingestion, Discord message
> sending, threat/protection services, and live internal connectors.

## Services to deploy (Railway)

Each is its own Railway service from this monorepo, with a start command:

| Service | Start command |
|---------|---------------|
| api | `pnpm --filter @attrakt/api start` |
| discord-bot | `pnpm --filter @attrakt/mcp-servers discord-bot` |
| discord-worker | `pnpm --filter @attrakt/mcp-servers discord-worker` |
| github-webhook | `pnpm --filter @attrakt/mcp-servers github-webhook` |
| github-worker | `pnpm --filter @attrakt/mcp-servers github-worker` |
| discourse-polling | `pnpm --filter @attrakt/mcp-servers discourse-polling` |
| discourse-worker | `pnpm --filter @attrakt/mcp-servers discourse-worker` |
| pulse-agent | `pnpm --filter @attrakt/agents pulse-agent` |

## Deploy steps (in order)

1. **Provision data stores.** Create the Railway Postgres plugin and an Upstash
   Redis database. Copy their connection strings.
2. **Run migrations** against the production database (from a machine with
   `DATABASE_URL` set):
   ```bash
   pnpm --filter @attrakt/core exec prisma migrate deploy
   ```
   TimescaleDB is deferred — do **not** run the `create_hypertable` lines; the
   tables work as plain Postgres.
3. **Provision the first client** (white-glove onboarding; no self-serve UI):
   ```bash
   pnpm client:create --name "Gnosis" --slug gnosis \
     --discord-guild <id> --github-org <org> --discourse-url <forum-url>
   ```
4. **Deploy the backend services** on Railway (table above), each with the shared
   env vars below. Set the GitHub webhook receiver's public URL as the repo/org
   webhook target, secured with `GITHUB_WEBHOOK_SECRET`.
5. **Deploy the admin app** to Vercel. Set its env vars (`DATABASE_URL`,
   `ADMIN_PASSWORD`). The admin build must run with `NODE_ENV=production`
   (Vercel does this by default; do not override it — a non-production value
   breaks the Next.js build).
6. **Backfill history** (optional) once credentials are live:
   ```bash
   pnpm ingest:backfill --client gnosis --platform discourse --days 90
   ```
7. **Generate the first artefacts**: `pnpm scoring:run --client gnosis`,
   `pnpm context:synthesise`/`context:activate`, `pnpm digest:run --client gnosis`.

## Production environment variables

**Required (non-secret):**

- `DATABASE_URL` — managed Postgres connection string
- `REDIS_URL` — Upstash Redis connection string
- `NODE_ENV=production`
- `PORT`, `GITHUB_WEBHOOK_PORT`

**Required secrets** (store in the host's secret manager, never in the repo):

- `ANTHROPIC_API_KEY` — Claude (model id is centralised in code: `claude-sonnet-4-6`)
- `GITHUB_WEBHOOK_SECRET` — verifies inbound webhook signatures
- `DISCORD_BOT_TOKEN` — Discord gateway
- `GITHUB_TOKEN` (or App credentials) — GitHub reads/backfill
- `DISCOURSE_API_KEY`, `DISCOURSE_API_USERNAME` — optional; Discourse reads (or set per client in `PlatformConfig.credentials`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CLIENT_EMAIL` — digest email delivery
- `ADMIN_PASSWORD` — shared-secret gate for the dashboard (Clerk slots in later)
- `SLACK_WEBHOOK_URL` — optional alerts

See `.env.example` for the full annotated list. Per-tenant platform IDs and
credentials live in `PlatformConfig` (set via `client:create`), not in env.

## CI

`.github/workflows/ci.yml` runs on every push and PR:

- **checks:** type-check (core + admin) and the production admin build; lint runs
  advisory-only (the shared eslint ruleset/plugin needs a follow-up).
- **test:** applies migrations with `prisma migrate deploy` (so the migration
  history itself is validated), then runs unit tests, the multi-tenancy
  integration tests, and the critical-path smoke test against real Postgres +
  Redis service containers.

> Known follow-up: `api`, `agents`, and `mcp-servers` are not yet type-checked in
> isolation. The root tsconfig `paths` resolve workspace deps to source, so each
> consumer pulls another package's `src` and trips `rootDir`. Fixing it cleanly
> needs TypeScript project references (build `core`/`api` to declarations and
> reference them) plus adding the `@typescript-eslint` plugin for lint. CI scopes
> to the green checks (core + admin type-check, build, tests) until then.

## Database backup & restore

- **Backups:** use the managed provider's automated daily backups + point-in-time
  recovery (Railway Postgres / your managed PG). No app-level backup job is
  needed.
- **Restore procedure:** provision a new Postgres instance from the latest
  snapshot (or PITR to a timestamp), point `DATABASE_URL` at it, run
  `prisma migrate deploy` to confirm schema parity, and restart the services.
  Verify with the `/[clientSlug]/status` page and a `GET /health` on the API.
- **Confidentiality & encryption:** backups now contain **client-confidential
  knowledge documents** (`KnowledgeDocument`, `ContextProfile`). Encryption at
  rest **must be confirmed enabled with the provider** for both the primary
  database and its backups. See `docs/DATA_HANDLING.md`.

## Monitoring

- API health: `GET /health`
- Queue dashboard: `/admin/queues` (Bull-Board) on the API service
- Ingestion health: the `/[clientSlug]/status` page (last successful run, items
  ingested, error count per platform)
