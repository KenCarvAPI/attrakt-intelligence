# CLAUDE.md — standing rules

Project conventions for Attrakt Intelligence. Follow these on every change.

- **Claude model:** use `claude-sonnet-4-6` for all Claude API calls, defined
  once in `packages/core` config (`config.claudeModel`, re-exported as
  `CLAUDE_MODEL`) and imported everywhere. Never hardcode a model string elsewhere.
- **Out of scope until further notice:** protection-mcp / threat evidence,
  Twitter ingestion, Discord message sending, billing, white-labelling, and live
  connectors to internal systems (Notion/Drive/Slack). Knowledge intake is
  upload/paste only.
- **Multi-tenancy:** every data query must be scoped by `clientId`. Never
  hardcode `"default"`. Workers and schedulers iterate over active clients.
- **Confidentiality:** `KnowledgeDocument` and `ContextProfile` are
  client-confidential — tenant-scoped always, never logged in full, never used
  in any cross-client operation. See `docs/DATA_HANDLING.md`.
- **Member opt-out:** excluded (and merged) members are filtered from scoring,
  briefs, digests, and campaigns via the shared `SCORABLE_MEMBER_WHERE` clause.
- **Prompts:** agent prompts live as versioned template files in
  `packages/agents/prompts/`, never inline strings.
- **Patterns:** prefer following existing repo patterns over introducing new
  libraries.
- **Copy:** British English in all user-facing copy. No em dashes.
- **TimescaleDB:** not used for MVP; hypertable lines stay deferred (plain
  Postgres).

## Monorepo layout

- `packages/core` — Prisma schema, platform clients (Discord/GitHub/Discourse),
  identity resolution, scoring maths, services (clients, members, knowledge,
  context-profile, ingestion-runs), shared config/types.
- `packages/api` — Express server: health, Bull-Board, brief/knowledge/campaign
  routes; BullMQ queues, metrics scheduler + worker.
- `packages/mcp-servers` — ingestion bots/workers + polling (Discord, GitHub,
  Discourse), backfill CLI, MCP tool servers.
- `packages/agents` — Claude agents: scoring (helpfulness + advocate briefs),
  context synthesis, campaign briefs, pulse (weekly digest).
- `apps/admin` — Next.js dashboard (overview, members, context, status).
