# Context Engine — Design (for approval)

**Date:** 2026-06-21
**Status:** ✅ CE-0 (foundation) implemented · later phases proposed

> **CE-0 shipped (2026-06-21).** The structured queryable store, retrieval, the
> in-house connector framework, and the grounding refactor are built and tested.
> What landed:
> - Models: `ContextSource`, `ContextItem`, `ContextChunk`, `ContextSyncRun` +
>   `ContextDomain` enum (migration `20260621000000_context_engine`).
> - Embeddings: pluggable provider — **Voyage AI** when `VOYAGE_API_KEY` is set,
>   else a deterministic hash fallback so it runs offline/in CI
>   (`src/context/embeddings.ts`).
> - Vector storage: `embedding Float[]` on plain Postgres; cosine similarity in
>   the service layer. **pgvector is the documented upgrade path** (swap column
>   type + push ranking into SQL; callers unchanged).
> - Store + retrieval: `upsertContextItem`, `projectKnowledgeDocument`,
>   `backfillKnowledgeDocuments`, `queryContext()` (token-bounded grounding).
> - Connector framework: `Connector` interface + registry + `runSync()` (records
>   `ContextSyncRun`). SaaS connectors are CE-1+.
> - Wiring: manual knowledge intake now projects into the store; the
>   campaign-agent grounds on **profile overview + retrieved snippets** instead of
>   wholesale; `pnpm context:backfill` reconciles existing data; admin `/context`
>   gains a **Connections** panel.
> - Tests: 16 unit tests (chunking, cosine/ranking, embeddings, hashing, grounding
>   budget) green alongside the existing suite.

**Originally:** Proposal — review & approve before implementation
**Related:** `docs/SITEMAP_AND_UI_PLAN.md` (Pillar B), built code in
`packages/core/src/services/{knowledge,context-profile}.ts`,
`packages/agents/src/context-agent/`, `apps/admin/src/app/[clientSlug]/context/`.

---

## 1. Why this exists & what changes

The Context Engine is the **integration + grounding layer** ("Pillar B"). It is
how a client (or Attrakt on their behalf) connects *everything* about their world
into the intelligence layer so that every output — pulse digests, advocate
briefs, campaign briefs — is grounded in the client's real products, brand,
audience, strategy, activity, and performance.

### What's built today
- **Manual intake only:** `KnowledgeDocument` = paste/upload raw text, 7 source
  types, content-hash dedupe, 1M-char cap.
- **One synthesized profile:** `ContextProfile` (versioned, one active) with 5
  JSON sections — products, brandVoice, audience, marketingFunction,
  strategicDirection.
- **Wholesale grounding:** `formatContextForPrompt()` injects the *entire* active
  profile into every prompt.

### The two problems this design solves
1. **Too few inputs.** Only manual document uploads + the community-ingestion
   data. We need to connect **as many live sources as possible**.
2. **"One big file loaded wholesale" anti-pattern.** The whole profile is dumped
   into every prompt. We need a **structured, queryable store** that returns only
   what's relevant to a given task, and that scales as data volume grows.

### Design principles
- **Connect everything connectable.** A connector framework, not bespoke code per
  source. New sources are configuration + a thin adapter.
- **Structured & queryable, not monolithic.** Normalize every source into typed,
  timestamped records; retrieve on demand (semantic + structured filters); keep
  synthesized summaries as a *cache*, not the only access path.
- **Grounding is retrieval-augmented.** Outputs ask the store a question and get
  back the most relevant facts + current summaries — not a 50KB blob.
- **Freshness is first-class.** Live connectors sync on a cadence; every record
  knows when it happened and when it was ingested.
- **For both audiences.** Clients self-connect; Attrakt provisions through the
  same surface. Per-client isolation throughout.

---

## 2. The context universe (connector catalog)

Mapped to the five ingestion categories from the reference client, plus the
community/ecosystem data this platform **already** collects.

### Domain A — Strategy, brand, growth & ecosystem *(structured, queryable store)*
The "who we are and where we're going" layer. Mostly documents + wikis.
| Source | Connector | Method | Notes |
|---|---|---|---|
| Manual upload/paste | ✅ built (`KnowledgeDocument`) | UI | becomes one connector feeding the store |
| Notion | Notion API | OAuth | strategy/brand wikis, growth docs |
| Google Docs / Drive | Google Drive API | OAuth | brand guidelines, strategy decks |
| Confluence | Atlassian API | OAuth | enterprise wikis |
| Website | crawler | scheduled fetch | positioning, public messaging (`website` type exists) |

### Domain B — Product updates across the org *(product ingestion pipeline)*
"What is the product doing." From eng + PM tools.
| Source | Connector | Method | Data |
|---|---|---|---|
| GitHub | GitHub App | webhook + API | releases, merged PRs, changelogs, README/docs, milestones |
| Linear | Linear API | OAuth + webhook | issues, projects, cycles, releases, roadmap |
| Jira | Atlassian API | OAuth | issues, epics, releases |
| Productboard | API | API key | roadmap, feature status |
| Notion / changelog tools | API | OAuth | product wikis, release notes |

> Note: GitHub is already ingested for *community* signals (Pillar A). The product
> pipeline reuses the connection but extracts *product meaning* (releases, roadmap)
> rather than contributor activity.

### Domain C — External community & ecosystem updates *(already hooked up)*
"What the community and the wider ecosystem are doing." **This is the data the
platform already collects** — it becomes a context input, not just a metric.
| Source | Status | Data |
|---|---|---|
| Discord | ✅ ingested | conversations, sentiment, topics |
| GitHub | ✅ ingested | contributor activity |
| Twitter/X | ✅ ingested | mentions, engagement |
| Discourse | ✅ ingested | governance/forum posts |
| Governance (Snapshot/Tally) | planned | proposals, votes (web3) |
| Ecosystem news / RSS / competitor feeds | planned | external signals |
| Farcaster / Telegram / Reddit | planned | additional community surfaces |

### Domain D — Marketing team activity *(ops feed)*
"What the marketing team is planning and shipping." Content calendars, campaign
planners.
| Source | Connector | Method | Data |
|---|---|---|---|
| Notion | API | OAuth | content calendars, campaign docs |
| Airtable | API | OAuth/key | campaign planners, content DBs |
| Asana / Trello / ClickUp | API | OAuth | marketing task boards |
| Google Sheets / Calendar | API | OAuth | calendars, schedules |
| CMS (Contentful/Webflow/WordPress) | API | key | published & scheduled content |
| Buffer / Hootsuite / Sprout | API | OAuth | scheduled social content |

### Domain E — Marketing data / performance *(quant)*
"How marketing is performing." Time-series + research. *("scope this out further")*
| Source | Connector | Method | Data |
|---|---|---|---|
| Google Analytics (GA4) | Data API | OAuth | traffic, conversions, funnels |
| Google Search Console | API | OAuth | search/SEO performance |
| Google Ads | API | OAuth | spend, performance |
| Meta / LinkedIn / X Ads | APIs | OAuth | ad performance |
| Social analytics (native or aggregator) | APIs | OAuth | reach, engagement |
| HubSpot / marketing automation | API | OAuth | leads, email, lifecycle |
| Product analytics (Mixpanel/Amplitude) | API | key | activation, retention |
| User research (Dovetail / Typeform / surveys) | APIs | OAuth/key | qualitative findings, NPS |

---

## 3. Architecture

```
                  ┌──────────────────────────────────────────────┐
  CONNECTORS  →   │  NORMALIZE   →   STRUCTURED STORE   →  RETRIEVE │  → GROUNDING
  (A–E above)     │                                                │     CONSUMERS
                  └──────────────────────────────────────────────┘
```

1. **Connectors** authenticate (OAuth/API key/webhook) and pull source data on a
   cadence. Reuse the existing BullMQ ingestion pattern (`ingest:*` jobs) and a
   per-client `ContextSource` config (generalizes today's `PlatformConfig` +
   `KnowledgeSourceType`).
2. **Normalize** each source into typed `ContextItem` records (a doc, a release, a
   campaign, a metric snapshot, a research finding, a community signal) with a
   common envelope: domain, kind, source, `occurredAt`, structured fields, text,
   content hash (dedupe).
3. **Structured store** has three tiers:
   - **Items** — the normalized records (queryable by domain/kind/source/recency).
   - **Chunks + embeddings** — text split into chunks, embedded (pgvector) for
     semantic retrieval. *This is what replaces "load the whole file."*
   - **Metrics** — quantitative series (GA4/ads/social) stored as time-series and
     surfaced as computed summaries, never raw rows in prompts.
4. **Retrieve** — a single `queryContext({ clientId, intent, filters, k })` API:
   hybrid semantic + structured search returning the top-k relevant chunks, the
   relevant structured facts, and the current domain summaries.
5. **Synthesis** — the existing `context-agent` refreshes **rolling per-domain
   summaries** (the `ContextProfile`, extended) on a cadence and on demand. The
   profile becomes a cheap, always-injectable *overview*; retrieval handles
   *specifics*. **Hybrid grounding**, not either/or.
6. **Grounding consumers** — pulse/advocate/campaign generators call
   `queryContext()` for the task at hand instead of `formatContextForPrompt()`
   dumping everything. The profile overview is still injected as a small header.

---

## 4. Data model additions

Proposed new/changed models (Prisma). Backwards-compatible: `KnowledgeDocument`
stays as the "manual upload" connector and is projected into `ContextItem`.

```prisma
model ContextSource {            // a connected source per client (generalizes PlatformConfig)
  id          String   @id @default(cuid())
  clientId    String
  domain      ContextDomain      // STRATEGY | PRODUCT | COMMUNITY | MARKETING_OPS | MARKETING_DATA
  connector   String             // "notion" | "github" | "linear" | "ga4" | "manual" | ...
  status      String             // connected | error | disabled
  config      Json               // source-specific (repos, properties, board ids)
  credentialRef String?          // pointer into the secret vault (no secrets in row)
  cadence     String?            // cron / webhook / manual
  lastSyncedAt DateTime?
  @@unique([clientId, connector, ...])
}

model ContextItem {             // normalized record from any source
  id          String   @id @default(cuid())
  clientId    String
  sourceId    String
  domain      ContextDomain
  kind        String             // document | release | issue | campaign | metric_snapshot | research | community_signal
  externalId  String?
  title       String?
  structured  Json     @default("{}")
  text        String?            // narrative text (chunked + embedded)
  occurredAt  DateTime?
  ingestedAt  DateTime @default(now())
  contentHash String
  @@unique([clientId, sourceId, contentHash])
  @@index([clientId, domain, occurredAt])
}

model ContextChunk {            // retrieval unit
  id        String  @id @default(cuid())
  clientId  String
  itemId    String
  text      String
  embedding  Unsupported("vector(1024)")?   // pgvector
  tokenCount Int
  @@index([clientId])
}

model ContextSyncRun {          // observability per sync
  id String @id @default(cuid())
  sourceId String
  startedAt DateTime
  finishedAt DateTime?
  status String                 // running | ok | error
  itemsIngested Int @default(0)
  error String?
}

// ContextProfile: extend sections beyond the current 5 to cover new domains
// (e.g. productState, ecosystem, marketingActivity, performanceSnapshot) OR keep
// 5 stable "identity" sections and treat fast-moving domains as retrieval-only
// with rolling summaries. (Decision in §9.)
```

Quantitative series (GA4/ads/social) reuse a `Metric`-style time-series table
rather than `ContextItem`, with summaries computed for grounding.

**Embeddings:** pluggable provider behind an interface; default **Voyage AI**
(Anthropic's recommended embeddings partner), stored in **pgvector** (already on
Postgres). OpenAI as an alternative adapter.

---

## 5. Retrieval & synthesis (the "not one big file" part)

- **At write time:** items are chunked (~500–800 tokens, overlap), embedded, and
  indexed. Metrics are aggregated into daily/weekly rollups.
- **At read time** a consumer calls `queryContext()` with its intent. Example —
  a campaign brief for "launch announcement":
  - semantic search over chunks (brand voice, positioning, past launch content)
  - structured pulls (latest releases from PRODUCT, upcoming items from
    MARKETING_OPS calendar, top advocates from Pillar A)
  - metric summaries (recent channel performance from MARKETING_DATA)
  - the small profile overview header
  → assembled into a focused, bounded grounding block.
- **Synthesis** keeps running map-reduce summaries per domain (cheap to inject,
  refreshed on sync), so common context is always present without a retrieval
  round-trip; retrieval adds task-specific depth. **Token budget is enforced** per
  consumer so prompts stay bounded regardless of how much is connected.

---

## 6. Cross-cutting concerns

- **Auth & secrets:** OAuth (read-only scopes) where possible; tokens in a secret
  vault referenced by `credentialRef` (no secrets in DB rows). Encrypt at rest.
- **Sync:** webhooks where available (GitHub, Linear), polling otherwise; backoff
  + `ContextSyncRun` observability; incremental (cursor/`updatedAt`) not full
  re-pulls.
- **Dedupe & freshness:** content hash per item; `occurredAt` vs `ingestedAt`;
  supersede stale versions of the same `externalId`.
- **Tenancy & privacy:** every row scoped by `clientId`; per-source PII policy &
  retention; clients can disconnect a source and purge its items.
- **Cost:** embeddings + LLM synthesis cost scales with volume — chunk caps,
  incremental embedding, and summary caching keep it bounded.
- **Connectors built in-house (decided):** each source gets a thin in-house
  adapter behind a common connector interface (auth + sync + normalize). No
  third-party integration provider. This means the connector framework
  (shared OAuth/token handling, sync scheduling, incremental cursors, retries)
  is itself a CE-0 deliverable so adding a source is "implement the interface,"
  not rebuild plumbing. Trade-off accepted: more maintenance across APIs in
  exchange for full control and no per-connection vendor cost.

---

## 7. Phased rollout

| Phase | Scope | Outcome |
|---|---|---|
| **CE-0 Foundation** ✅ | Structured store (`ContextSource`/`ContextItem`/`ContextChunk`/`ContextSyncRun`), embeddings + retrieval, in-house connector framework, refactor manual `KnowledgeDocument` into the store, switch grounding from wholesale → retrieval-augmented | **Done 2026-06-21.** Existing features keep working, now retrieval-based. (Community-data projection landed in CE-1 via the `community` connector.) |
| **CE-1 Product pipeline (Domain B)** ✅ | GitHub product extraction (releases + merged PRs) + **Linear** (issues/projects) + the deferred **community** projection (Messages → COMMUNITY items) | **Done 2026-06-21.** Three connectors behind the in-house framework (`github_product`, `linear`, `community`), registered via `ensureBuiltinConnectorsRegistered()`, runnable via `pnpm context:sync --source <id>`. Pure normalizers unit-tested against fixtures (live egress restricted in this env). |
| **CE-2 Strategy & ops (A + D)** | Notion + Google Drive/Docs + Airtable + Calendar | Strategy/brand store + marketing activity feed |
| **CE-3 Performance (Domain E)** | GA4 + Google Ads + Meta Ads + social analytics | Quantitative grounding & performance summaries |
| **CE-4 Research & long tail** | Dovetail/surveys, governance (Snapshot/Tally), RSS/news, more community surfaces | Full coverage |

Connector priority within phases is configurable; CE-0 is the prerequisite for
everything and is where the "queryable store, not one big file" promise is kept.

---

## 8. What changes in existing code

- `KnowledgeDocument` → kept, but ingestion also writes a `ContextItem` (kind
  `document`) so manual uploads flow through the same store.
- `context-profile.ts` → `formatContextForPrompt()` becomes a small overview
  header; add `queryContext()` for task-specific retrieval. Consumers
  (pulse-agent, advocate briefs, campaign briefs) call both.
- `context-agent` → extended to (a) chunk+embed items, (b) refresh per-domain
  rolling summaries, (c) keep the versioned profile.
- `PlatformConfig` → generalized by / unified with `ContextSource` (community
  ingestion connectors become Domain-C sources). Migration path TBD in design
  review.
- Admin `/context` UI → add a **Connections** section (connect/manage sources per
  domain, show sync status) alongside the existing knowledge + profile + campaign
  UI.

---

## 9. Decisions

**Resolved (2026-06-21):**
1. ✅ **Connector strategy → build in-house.** A common connector interface +
   shared plumbing (OAuth/token vault, sync scheduling, incremental cursors,
   retries) is a CE-0 deliverable; each source is a thin adapter. No third-party
   integration provider.
2. ✅ **Profile shape → stable identity + retrieval.** Keep the 5 stable
   `ContextProfile` sections (products, brandVoice, audience, marketingFunction,
   strategicDirection) as the always-injected overview. Fast-moving domains
   (product releases, campaigns, performance) are **retrieval-only with rolling
   summaries** — not new profile sections.
3. ✅ **Build order → CE-0 foundation first.** The structured store + retrieval +
   refactor of existing grounding ships before any new connector, so we never
   deepen the "one big file" pattern.

**Defaults (assumed unless you object):**
4. **Retrieval store → pgvector** on the existing Postgres (no dedicated vector DB).
5. **First connectors after CE-0 → GitHub-product + Linear** (Domain B product
   pipeline), matching the reference client's in-testing pipeline.

**CE-0 deliverables (the foundation):**
- `ContextSource` / `ContextItem` / `ContextChunk` / `ContextSyncRun` models + migration
- pgvector + pluggable embeddings (default Voyage AI)
- the in-house **connector interface** + shared sync/auth plumbing + BullMQ wiring
- `queryContext()` retrieval API (hybrid semantic + structured)
- refactor: manual `KnowledgeDocument` and existing community data → `ContextItem`;
  grounding consumers switch from wholesale `formatContextForPrompt()` to
  retrieval + small overview header
- `/context` UI: add a Connections section (per-domain sources + sync status)
</content>
