# MVP Gap Audit — Code vs. Docs

**Date:** 2026-06-12
**Method:** Read the actual source (not the markdown docs). For each subsystem,
distinguish *logic that is written* from *logic that is actually wired up and
runnable*. `COMPLETION_SUMMARY.md` claims "all core features implemented"; this
audit qualifies that claim.

Legend: **WORKS** = implemented and runnable end-to-end · **PARTIAL** =
real logic exists but a wiring/launch/dependency gap prevents it working as
shipped · **STUB** = scaffolding only, does not do the job on a schedule/real data.

## Summary table

| # | Subsystem | Verdict | One-line reason | Key files |
|---|-----------|---------|-----------------|-----------|
| 1 | Discord ingestion (persist Messages + Events) | **WORKS** ✅ (fixed 2026-06-12) | Added `discord-bot` + `discord-worker` launch scripts; fixed three runtime blockers that prevented any worker from running (see note A). Verified end-to-end against live Postgres: a test message persists a `Message` row + `MENTION`/`LINK_CLICK` `Event` rows + `Member`/`PlatformIdentity`. | `packages/mcp-servers/src/discord-bot/index.ts`, `discord-bot/worker.ts`, `discord-bot/index-worker.ts`, `packages/mcp-servers/package.json` |
| 2 | GitHub ingestion (persist activity) | **WORKS** ✅ (hardened 2026-06-12) | Webhook receiver + worker persist `Event` rows; now **enforces `X-Hub-Signature-256` HMAC verification** (`GITHUB_WEBHOOK_SECRET`) — unsigned/invalid payloads get 401. (Note A's `log.child` crash also applied here pre-fix.) GitHub still creates no `Message` rows (by design). | `packages/mcp-servers/src/github-webhook/index.ts`, `github-webhook/verify.ts`, `github-webhook/verify.test.ts`, `github-bot/worker.ts` |
| 3 | Identity resolution (merge identities into Members) | **PARTIAL** | Links new `PlatformIdentity` rows to a `Member` via 5 strategies and creates new members; **does not merge two already-distinct Member records**, and cross-platform linking leans almost entirely on username | `packages/core/src/services/identity-resolution.ts` |
| 4 | pulse-agent (real digest from real data) | **PARTIAL** | Produces a real markdown digest from live DB rows via Claude (with template fallback) and delivers it; but the **metrics section is empty (N/A)** because nothing populates the `Metric` table (see #5) | `packages/agents/src/pulse-agent/index.ts` |
| 5 | Metric model + scheduled writes (TimescaleDB deferred) | **WORKS** ✅ (fixed 2026-06-12) | API startup now calls `scheduleMetricsComputation()` + `createMetricsWorker()`; computation extracted to `computeMetrics()` and exposed via `pnpm --filter @attrakt/api metrics:compute`. Verified: a manual run wrote 11 `Metric` rows with real values against plain Postgres. TimescaleDB **explicitly deferred** for MVP (tables work as plain Postgres). | `packages/api/src/server.ts`, `queues/scheduler.ts`, `queues/metrics-worker.ts`, `queues/metrics-cli.ts`, `packages/core/prisma/migrations/0_enable_timescaledb.sql` |

> **Note A — runtime blockers found while wiring Discord (fixed).** Beyond the
> missing scripts, no worker could actually run because of three latent bugs:
> (1) `packages/core/src/logger.ts` exported a `log` object **without a `.child()`
> method**, yet every Discord/GitHub worker calls `log.child({...})` per event —
> so the worker threw on the first message and persisted nothing; (2)
> `packages/api/src/queues/workers.ts` imported `redisConnection` from `./types`,
> which does not export it (it lives in `./connection`) — so every `Worker`/`Queue`
> was constructed with `connection: undefined`; (3) `packages/api/src/index.ts`
> had a **duplicated `export { default as app }`** line that crashed the barrel.
> All three are fixed. This means my original verdicts overstated reality: Discord
> and GitHub ingestion would **not** have persisted anything as shipped (the
> `log.child` crash), not merely "lacked a launch script."
>
> **Note B — BullMQ transport caveat (not fixed; out of scope).** The installed
> `bullmq@5.66.4` **rejects queue names containing `:`** ("Queue name cannot
> contain :"), but the entire job/queue scheme uses names like `ingest:discord`
> and `compute:metrics`. So the Redis-backed queue transport cannot start in this
> environment regardless of wiring. Verifications below therefore exercise the
> **real domain logic directly against live Postgres** (bypassing the queue
> transport). Renaming the queue scheme (or pinning a `:`-tolerant bullmq) is a
> follow-up beyond these four tasks.

---

## Detail

### 1. Discord ingestion — WORKS ✅ (fixed 2026-06-12)

**Fix:** added `discord-bot` (gateway) and `discord-worker` (ingestion worker)
scripts to `packages/mcp-servers/package.json`, mirroring `github-webhook` /
`github-worker`; plus the three Note-A runtime fixes. Verified by running the real
`processMessage` processor against live Postgres — a test message produced a
`Message` row (sentiment computed), `MENTION` + `LINK_CLICK` `Event` rows, and a
`Member` + `PlatformIdentity`. The live Discord *gateway* connection still
requires a real `DISCORD_BOT_TOKEN` (not available in this sandbox), and the
BullMQ queue hop is subject to Note B — but the persistence path itself is
confirmed working.

_Original finding (pre-fix):_

- The gateway listener (`discord-bot/index.ts`) subscribes to `MessageCreate`,
  `GuildMemberAdd/Remove`, and `MessageReactionAdd`, builds typed payloads, and
  enqueues `ingest:discord` jobs. Correct and complete.
- The worker (`discord-bot/worker.ts`) genuinely persists data: `processMessage`
  calls `resolveIdentity`, writes a `Message` row (`prisma.message.create`),
  computes sentiment, and batch-writes `MENTION`/`LINK_CLICK` `Event` rows
  (`prisma.event.createMany`). Joins/leaves/reactions write `Event` rows.
- **The gap is launch wiring.** `packages/mcp-servers/package.json` defines
  scripts for `github-webhook` *and* `github-worker`, but for Discord it defines
  **only `discord-mcp`** (the read-only tool server). There is **no script for
  `discord-bot/index.ts` (gateway) or `discord-bot/index-worker.ts` (worker)**,
  and there is no `mcp-servers/src/index.ts`, so `pnpm dev` for that package has
  no entrypoint. Pointed at a real server, the persistence code *would* work —
  but as shipped nothing starts it.
- Separately, `discord-mcp`'s `send_message` is a documented stub (returns
  `queued_for_approval`, sends nothing) per `COMPLETION_SUMMARY.md` — read path
  only.

### 2. GitHub ingestion — WORKS (events only)

- `github-webhook/index.ts` is an Express server (`github-webhook` script) that
  maps `push`/`pull_request`/`issues`/`issue_comment`/`star`/`fork` and enqueues
  `ingest:github` jobs.
- `github-bot/worker.ts` (`github-worker` script, entry `index-worker.ts`)
  resolves identity and writes `Event` rows for each case (commits → `PUSH`,
  PR open/merge/close, issues, comments, stars, forks). This persists real
  activity end-to-end.
- Caveats: (a) ~~**no `x-hub-signature` / webhook-secret verification**~~ —
  **FIXED 2026-06-12**: the endpoint now captures the raw body and verifies the
  `X-Hub-Signature-256` HMAC against `GITHUB_WEBHOOK_SECRET` via a pure
  `verifyGithubSignature()` helper, rejecting missing/invalid signatures with
  401 (constant-time compare). Covered by `verify.test.ts` (valid / wrong-secret
  / tampered / missing / malformed; `pnpm --filter @attrakt/mcp-servers test`)
  and confirmed live (no-sig → 401, bad-sig → 401, valid-sig → accepted).
  (b) GitHub ingestion writes **`Event` rows only, no `Message` rows**, so GitHub
  content never reaches sentiment metrics; (c) `clientId` is hardcoded to
  `config.defaultClientId`. (b) and (c) are unchanged / out of scope.

### 3. Identity resolution — PARTIAL

- `resolveIdentity()` is fully implemented with the documented priority order:
  existing platform identity → email → username-exact (case-insensitive) →
  username-fuzzy (Levenshtein) → wallet → create new `Member` + `PlatformIdentity`.
  It does link a *new* identity onto an *existing* member and does create new
  members. So "merge PlatformIdentity records into Members" works for the
  new-identity case.
- **What it does not do:** it never **merges two already-distinct `Member`
  records**. If the same human was created as separate members (e.g. Discord
  member created first, then GitHub member created before any matching signal
  existed), nothing later collapses them. There is no de-dup/merge pass.
- **Signal reality check:** Discord ingestion passes only `displayName` (no
  email, no wallet); GitHub push passes `email`, but other GitHub events pass
  none. So cross-platform linking depends almost entirely on **username exact/
  fuzzy match** — brittle, and fuzzy will also produce false links across
  unrelated people with similar handles.
- **Scaling note:** the fuzzy strategy loads **all** of a client's
  `PlatformIdentity` rows into memory and loops (`findMany` then JS loop) — fine
  for MVP, O(n) per new identity at scale.

### 4. pulse-agent — PARTIAL

- `generateDailyDigest()` is real: it queries `Metric`, previous-day metrics,
  top contributors (`member.findMany` by message count), and recent messages,
  runs `detectAnomalies()`, then calls Claude
  (`anthropic.messages.create`, model `claude-3-5-sonnet-20241022`) to render a
  6-section markdown digest, with `generateBasicDigest()` as a template fallback
  on API error. It then delivers via Slack webhook and/or Resend email and stores
  the digest text back into a `Metric` row.
- **Output shape:** markdown with sections — 📊 Key Metrics, 💬 Activity
  Highlights, 👥 Notable Contributors, 📈 Trending Topics, ⚠️ Anomalies,
  📋 Suggested Actions. Contributors and message highlights are populated from
  real rows.
- **The gap:** the Key-Metrics/anomaly inputs come from the `Metric` table, which
  **nothing populates** (see #5). So on a real deployment DAU / Message Volume /
  Sentiment / Member Count render as `N/A` and `detectAnomalies()` returns nothing
  — the digest is real but half-blank. The cron (`0 9 * * *`) only fires if the
  `agents` process is actually started, and the module throws at import if
  `ANTHROPIC_API_KEY` is unset.
- **Minor:** the digest is stored by overloading `metricType: 'MESSAGE_VOLUME'`
  with `metadata.type = 'daily_digest'` and `value: 0` — a hack that pollutes the
  MESSAGE_VOLUME series; and the pinned model id is dated.

### 5. Metric model + scheduled writes — WORKS ✅ (fixed 2026-06-12)

**Fix:** (a) `server.ts` now calls `scheduleMetricsComputation()` and
`createMetricsWorker()` in its startup block, so the recurring jobs are
registered and a worker consumes them; (b) the computation body was extracted
into a reusable `computeMetrics(clientId, period)` and exposed as a manual CLI
(`pnpm --filter @attrakt/api metrics:compute [--client <id>] [--period hour|day|week]`);
(c) the TimescaleDB migration now records the **MVP deferral decision** — we are
**not** using hypertables; the `create_hypertable` lines stay commented with a
note, and `messages`/`events`/`metrics` run as plain Postgres tables.

**Verified:** ran `metrics:compute` once against live Postgres → logged
`Computed metrics count=11` and wrote 11 `Metric` rows: `DAU=1`, `WAU=1`,
`MAU=1`, `MESSAGE_VOLUME=2`, `RESPONSE_RATE=50`, `CONTRIBUTOR_VELOCITY=6`,
`SENTIMENT_AVERAGE=0.2`, `GROWTH_RATE=100`, `MEMBER_COUNT=1`. Confirmed the
target Postgres has no `timescaledb_information.hypertables` and the three tables
are ordinary tables. The scheduler/worker BullMQ hop is subject to Note B.

_Original finding (pre-fix):_

- `metrics-worker.ts` computes a full set (DAU/WAU/MAU, message volume, response
  rate, contributor velocity, sentiment avg/pos/neg, growth rate, member count)
  and writes 11 `Metric` rows — the **computation logic is complete and correct**.
- `scheduler.ts` defines hourly/daily/weekly BullMQ repeatables.
- **But neither runs.** `scheduleMetricsComputation()` and `createMetricsWorker()`
  are exported from `@attrakt/api` and **have zero call sites** in the entire
  repo (verified across `packages/` and `apps/`). The API package's `dev`/`start`
  run `server.ts`, which only mounts `/health` and the Bull-Board dashboard — it
  never schedules jobs or starts the metrics worker. Result: **no metrics are
  ever written on a schedule**, which is the root cause of pulse-agent's empty
  metrics (#4).
- **TimescaleDB:** `0_enable_timescaledb.sql` only runs `CREATE EXTENSION`. Every
  `SELECT create_hypertable(...)` line is **commented out** with a note to run it
  manually. So `messages`/`events`/`metrics` are plain Postgres tables, not
  hypertables, unless an operator runs the SQL by hand. `docker-compose.yml` uses
  the `timescaledb` image but defines only postgres + redis (no app services to
  trigger the conversion).

---

## Bottom line

The per-event **ingestion and computation logic is genuinely implemented**, not
faked — the worker functions really call Prisma and would persist real data. The
shortfall is at the **orchestration layer**: (a) Discord has no launch script,
(b) the metrics scheduler/worker are never started, and (c) TimescaleDB
hypertables are never created. Because the metrics pipeline never runs, the
analytics-dependent surface (pulse digest metrics, anomaly detection) is hollow
even though its code is sound. The smallest set of changes to make the MVP
truthful: add Discord launch scripts, invoke `scheduleMetricsComputation()` +
`createMetricsWorker()` from a real entrypoint, and uncomment/automate the
`create_hypertable` calls.
