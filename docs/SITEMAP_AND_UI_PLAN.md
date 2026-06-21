# Attrakt — Site Map & UI Plan

**Date:** 2026-06-21
**Status:** Draft v3 (reconciled with the active build)
**Scope:** Information architecture, surfaces, navigation, and screen inventory
for the Attrakt Community Intelligence Platform.

This version is reconciled against the active build on branch
`claude/gifted-shannon-2ryjzk` (the line carrying multi-tenancy, the Context
Engine, advocate scoring, Discourse ingestion, and the admin dashboard). Where
this plan previously diverged from what's being built, it has been corrected.
Status markers: ✅ built · 🟡 partial / backend-only · ⬜ planned.

---

## 0. Reconciliation with the active build (read first)

The product as actually built is **broader** than the original
`PRODUCT_OVERVIEW.md` and than this plan's v1/v2. Two corrections matter most:

1. **It's one multi-tenant app, not five subdomain apps.** The build is a single
   Next.js dashboard (`apps/admin`) with **slug-based tenancy** — every screen
   lives under `/[clientSlug]/…` and the tenant is switched by URL. Auth is a
   shared-secret gate today, with a clearly marked **Clerk integration point**
   (`apps/admin/src/lib/auth.ts`): "map Clerk orgs → clients for multi-tenant
   access control." So the role/scope separation this plan describes will be
   delivered via **Clerk orgs**, not separate apps (at least initially).

2. **There are two product pillars; the original plan only covered one.**
   - **Pillar A — Community & Advocate Intelligence (the *output* layer):**
     monitor the community, score advocates, surface segments and health,
     generate digests, campaign briefs, and advocate briefs. (The original product.)
   - **Pillar B — Context Engine (the *input / grounding* layer):** the client's
     integration & grounding hub that feeds Pillar A. It has **two inputs**:
     **(i) platform connections** — wire up the data-source APIs (Discord,
     GitHub, Twitter, Discourse) into the intelligence layer; and **(ii)
     knowledge** — ingest the client's own material (product docs, brand
     guidelines, leadership interviews, strategy) → synthesize a **versioned
     context profile**. Everything Pillar A produces is *grounded in* this
     profile + connected data. **Used by both clients and Attrakt oversight.**
     The live app's `/context` tab ships input (ii) today; input (i) (API
     connection management in-UI) is the planned addition (`PlatformConfig` is
     operator/CLI-managed today).

> **Terminology note (resolved 2026-06-21):** "Context Engine" is the **superset**
> — connections **and** knowledge — not just document synthesis. This supersedes
> v2's separate "Settings → Connections" surface and v2's "connections are
> read-only for clients": clients connect their own APIs *through* the Context
> Engine, and Attrakt provisions through the same surface (hence "for both").
>
> **Scope expanded — see `docs/CONTEXT_ENGINE.md`** for the full design: the
> Context Engine should ingest as many live sources as possible across five
> domains (strategy/brand, product, community/ecosystem, marketing ops, marketing
> performance) into a **structured, queryable store** (retrieval-augmented
> grounding) rather than synthesizing one profile loaded wholesale. That doc is
> pending approval before implementation.

### What's actually built vs. what this plan adds

| Area | Status | Notes |
|------|--------|-------|
| Multi-tenant app, slug routing (`/[clientSlug]`) | ✅ built | `apps/admin` |
| Auth (shared-secret), Clerk planned | 🟡 partial | Clerk = future RBAC (orgs→clients) |
| Nav: **Overview / Members / Context** | ✅ built | `nav-tabs.tsx` |
| Overview: active/new members, messages, **governance posts**, activity chart, **segment distribution**, messages-by-platform | ✅ built | `[clientSlug]/page.tsx` |
| Members directory + member panel (advocate score + advocate brief) | ✅ built | `members/`, `member-panel.tsx` |
| **Context Engine** — knowledge intake → versioned profile → campaign brief | ✅ built | `context/page.tsx`, `context-agent` |
| **Context Engine** — structured store + retrieval (CE-0) | ✅ built | `packages/core/src/context/*`; see `docs/CONTEXT_ENGINE.md` |
| **Context Engine** — in-UI source connection management | 🟡 partial | Connections panel + `ContextSource` model built; SaaS connect flows = CE-1 |
| Advocate scoring + segments (Champion→Lurker) | ✅ built | `AdvocateScore`, `scoring/score.ts` |
| Helpfulness evaluation (Claude-scored) | ✅ built | `HelpfulnessEvaluation` |
| Weekly digest / ecosystem health report | ✅ built | `WeeklyDigest`, `pulse-weekly-v1` |
| Sources: Discord, GitHub, Twitter, **Discourse (governance)** | ✅ built | `Platform` enum + discourse-bot |
| Threat detection | 🟡 backend-only | `Threat` model + agent exist; **no UI tab yet** |
| Analytics tab (deep time-series) | ⬜ planned | only Overview charts today |
| Reports/exports tab | ⬜ planned | digests delivered, no archive UI |
| Settings tab (connections/team/alerts) | ⬜ planned | provisioning is operator/CLI today |
| Ops Console (cross-tenant portfolio) | ⬜ planned | today: tenant-switch by slug |
| System Admin app | ⬜ planned | backend ops via CLI scripts |
| Advocate Portal (external) | ⬜ planned | confirmed in scope |
| Developer Portal / Marketing site | ⬜ planned | roadmap |

### Decisions locked in (2026-06-21)
- **Advocate Portal** is in scope as a distinct external surface (⬜ not yet built).
- **Onboarding is Attrakt-provisioned** — consistent with the live app, which is
  operated as an internal/demo tool with data seeded/provisioned by operators
  (`pnpm seed:demo`, `context-synthesise`, `knowledge-add` CLIs). Clients do not
  self-connect platforms.

---

## 1. Audiences & roles

The three audiences you named map onto the **current single app** by tenant
scope + (future) Clerk role, and onto **planned** dedicated surfaces later.

| # | Audience | Today (built) | Planned surface |
|---|----------|---------------|-----------------|
| 1 | **Client** | A tenant's `/[clientSlug]` view in the shared app | `app.attrakt.io` workspace, Clerk org = client |
| 2 | **Attrakt oversight** | Operator switches tenants by slug; runs CLIs | `console.attrakt.io` cross-tenant Ops Console |
| 3 | **Master admin** | CLI scripts (seed, synthesise, merge, metrics) | `admin.attrakt.io` System Admin app |
| 4 | **Advocate / member** | — | `advocates.attrakt.io` external portal |
| 5 | **Client sub-roles** (Owner / Community Mgr / Moderator / Viewer) | not enforced (single shared secret) | Clerk org roles |
| 6 | **Developer / integrator** | — | `developers.attrakt.io` |
| 7 | **Prospect / public** | — | `attrakt.io` marketing |

**Implication:** RBAC is the gating dependency. Until Clerk lands, "client" vs.
"oversight" is a soft distinction (same login, tenant by URL). The role matrix
below is the target once Clerk orgs are wired.

### Role / permission matrix (target, via Clerk orgs)

| Capability | Owner/Admin | Community Mgr | Moderator | Viewer/Stakeholder |
|------------|:-----------:|:-------------:|:---------:|:------------------:|
| Overview & analytics | ✅ | ✅ | ◑ | 👁️ |
| Members & profiles | ✅ | ✅ | ✅ | 👁️ |
| Advocate scoring & briefs | ✅ | ✅ | — | 👁️ |
| Context Engine (knowledge, synthesis, campaigns) | ✅ | ✅ | — | 👁️ |
| Threat queue & actions (when UI ships) | ✅ | ✅ | ✅ | 👁️ |
| Reports & exports | ✅ | ✅ | — | ✅ |
| Connections / credentials | ✅ | — | — | — |
| Team & billing | ✅ | — | — | — |

---

## 2. Surface architecture

**Today (built):** one app, slug-tenanted.
```
apps/admin  →  /login  →  /[clientSlug]/(overview|members|context)
              shared-secret auth · Clerk integration point marked
```

**Target (planned):** the same app grows tabs and then splits scopes by Clerk
role/org; dedicated external surfaces are added as separate apps.
```
attrakt.io               → Marketing + onboarding (public)            ⬜
app.attrakt.io           → Client Workspace (Clerk org = client)      🟡 evolving from apps/admin
advocates.attrakt.io     → Advocate Portal (member-scoped)            ⬜ in scope
console.attrakt.io       → Attrakt Ops Console (cross-tenant)         ⬜
admin.attrakt.io         → System Admin (global/infra)               ⬜
developers.attrakt.io    → Developer/API portal                      ⬜
```
All share one design system (already present: `components/ui/*`, Tailwind) and
will share Clerk auth; scope + role gate what renders.

---

## 3. Site maps

### 3.1 Client Workspace — `apps/admin` → `app.attrakt.io` (Audience 1, 5)

**Tenant shell (✅ built):** sticky header with client name + "Intelligence",
nav tabs, `max-w-[1200px]` content. Root `/` redirects to first client slug.

**Onboarding (Attrakt-provisioned).** No client connect-wizard. Operators seed/
provision (`seed:demo`, knowledge intake, synthesis). Client first-run = guided
tour of a live workspace. (⬜ tour UI; provisioning is CLI/operator today.)

**Navigation — built + planned:**
```
/[clientSlug]                     Overview / Pulse                         ✅ built
  • Metric tiles: Active members · New members · Messages · Governance posts
  • Activity chart (messages + events/day, 90d)
  • Segment distribution (Champion/Advocate/Active/Casual/Lurker)
  • Messages by platform (Discord/GitHub/Twitter/Discourse)
  • (planned ⬜) today's AI digest inline, anomalies, open-threats summary

/[clientSlug]/members             Member directory                          ✅ built
  • Members table; member panel (sheet) on select
  • Panel shows advocate score + latest advocate brief + identities
  • (planned ⬜) merge identities, tags, saved segments

/[clientSlug]/context             Context Engine (integration + grounding hub)  ← Pillar B
  ── Connections (input i) ─────────────────────────────────────  🟡 backend-only
  • Connect / manage data-source APIs: Discord, GitHub, Twitter, Discourse
    (PlatformConfig: credentials + per-platform config, connection health)
  • Used by client (self-connect) AND Attrakt (provision on their behalf)
  ── Knowledge & profile (input ii) ────────────────────────────  ✅ built
  • Active context profile (versioned: draft/active/archived) — ContextSections
  • Knowledge documents list + intake (product_docs, brand_guidelines,
    marketing_material, leadership_interview, strategy_doc, website, other)
  • Re-synthesise action (regenerate profile from knowledge)
  • Campaign brief generator: objective → advocates to activate, channels,
    on-brand message angles (grounded in the active profile)
  • API: /api/[clientSlug]/context/{knowledge,resynthesise,campaign}

/[clientSlug]/advocates           Advocate program                          ⬜ planned
  • Leaderboard by segment, rising advocates, advocate briefs at scale
  • (recognition/rewards = Advocate Portal, §3.4)

/[clientSlug]/analytics           Deep analytics                            ⬜ planned
  • Time-series WoW/MoM, per-platform tabs, anomaly markers, export

/[clientSlug]/threats             Protection / threat queue                 🟡 backend-only
  • Queue by severity (LOW→CRITICAL) & status
    (DETECTED→REVIEWING→ACTIONED→RESOLVED/FALSE_POSITIVE), evidence, actions

/[clientSlug]/reports             Reports                                   ⬜ planned
  • Weekly digest archive (WeeklyDigest), scheduled reports, PDF/MD export

/[clientSlug]/settings            Settings                                  ⬜ planned
  • team & roles (Clerk), alert routing, digest prefs, data/GDPR, billing
  • (NOTE: platform connections live in the Context Engine, not here)
```

### 3.2 Attrakt Ops Console — `console.attrakt.io` (Audience 2) ⬜ planned

Cross-tenant lens. Today this is approximated by slug-switching + CLIs.
```
/                         Portfolio overview (all clients: health, MAU, churn-risk)
/clients                  Client list
  /clients/new            Provision a new client (Attrakt-led onboarding)
  /clients/:id            Client detail (usage, adoption, onboarding status)
    • "View as client" (impersonate, audit-logged)
  /clients/:id/setup      Provisioning — drives the client's Context Engine on their behalf
    • Connections: Discord bot · GitHub App/webhook · Twitter API · Discourse polling
    • seed knowledge + run first context synthesis (same Context Engine, operator-driven)
    • digest cadence, alert routing, severity thresholds → "ready to hand off"
    • (the Context Engine is shared "for both" — this is the Attrakt-side entry to it)
/growth                   Ecosystem growth (cross-community trends, shared advocates, benchmarks)
/success                  Account mgmt (adoption funnel, at-risk alerts, playbooks)
/threats                  Cross-client threat oversight (coordinated attacks)
/agents                   Agent ops (pulse/threat/context runs, quality, cost)
```

### 3.3 System Admin — `admin.attrakt.io` (Audience 3) ⬜ planned

Today: CLI scripts (`seed:demo`, `context-synthesise`, `context-activate`,
`knowledge-add`, `member:merge`, `metrics:compute`). A UI would wrap these:
```
/                  System health (BullMQ queues, workers, ingestion lag)
/tenants           Tenant CRUD, plan assignment
/users             Users & RBAC (Clerk admin)
/integrations      API keys, webhook secrets, OAuth apps, rate limits
/data              Member/identity merge, reprocessing, backfills, soft-delete review
/agents            Agent & model config (Anthropic key/model/prompts/schedules)
/knowledge         Knowledge & context-profile admin (versions, activate/archive)
/flags             Feature flags & plans
/audit             Audit log (admin + impersonation)
```

### 3.4 Advocate Portal — `advocates.attrakt.io` (Audience 4) ⬜ planned, ✅ in scope
External, member-facing. Auth via OAuth-connect (Discord/GitHub/Twitter), which
also strengthens identity resolution.
```
/                 Your impact (rank, segment, contribution + helpfulness summary)
/leaderboard      Community leaderboard & segment tiers
/quests           Quests / rewards / badges (phase 2)
/profile          Connected accounts, opt-in/out, privacy
```

### 3.5 Developer Portal — `developers.attrakt.io` (Audience 6) ⬜ planned
`/` API keys · `/webhooks` endpoints & logs · `/docs` reference · `/usage`.

### 3.6 Marketing site — `attrakt.io` (Audience 7) ⬜ planned
`/` · `/features` · `/pricing` · `/use-cases` · `/demo` · `/signup`.

---

## 4. Cross-cutting UI conventions

- **Design system (✅ present):** `components/ui/*` (button, card, input, badge,
  select, sheet, textarea, label), Tailwind tokens, `app-wash` background,
  `max-w-[1200px]` shell. New surfaces should reuse these.
- **Shell:** header + nav tabs today; sidebar + tenant switcher when scope grows.
- **Empty/loading states (✅ pattern exists):** e.g. "No client data — run
  seed:demo", "No active context profile — add knowledge then re-synthesise."
  Every analytics surface needs a "still collecting / not yet computed" state.
- **Auth seam:** keep server queries/route handlers auth-agnostic so Clerk drops
  in behind `isValidSession()` (already designed this way).
- **Auditability:** log impersonation and admin mutations once Ops/Admin ship.

---

## 5. Recommended build phases (reconciled)

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **0** | Design system + tenant shell + auth seam | ✅ done |
| **1** | Overview, Members + panel, Context Engine | ✅ done |
| **2** | **Clerk auth + org→client mapping + roles** (unblocks client vs. oversight separation) | ⬜ next |
| **3** | Threat queue UI (backend already exists), Reports/digest archive | ⬜ |
| **4** | Advocates tab + deep Analytics; Settings (read-only connections, team) | ⬜ |
| **5** | Ops Console (portfolio, provisioning, growth, success) | ⬜ |
| **6** | Advocate Portal (external) | ⬜ |
| **7** | System Admin UI; Developer Portal; Marketing site | ⬜ |

Phase 2 (Clerk) is the highest-leverage next step: it's the prerequisite for
real client vs. Attrakt-oversight vs. admin separation, and the seam is already
designed for it.

---

## 6. Resolved & remaining questions

**Resolved (2026-06-21):**
- ✅ Advocate Portal → distinct external surface, in scope.
- ✅ Onboarding → Attrakt-provisioned (matches the operated/seeded live app).
- ✅ Architecture clarified → single slug-tenanted app now; Clerk orgs for roles;
  dedicated surfaces split later.
- ✅ **Context Engine scope → superset (connections + knowledge), for both
  audiences.** It is the client's integration & grounding hub: connect the
  data-source APIs *and* upload knowledge, both feeding the intelligence layer.
  Clients self-connect through it; Attrakt provisions through the same surface.
  This replaces the earlier "Settings → Connections (read-only)" framing.

**Still open:**
1. **Surface split vs. one app** — do client, oversight, and admin stay one
   Clerk-gated app for the foreseeable future, or split into subdomains soon?
   (Recommend: one app + Clerk roles first; split only when needed.)
2. **Threat UI priority** — backend is built but unsurfaced. Promote a Threats
   tab in the next phase, or keep protection backend-only for now?
3. **Client sub-roles** — confirm Owner / Community Mgr / Moderator / Viewer maps
   to your customers, so Clerk org roles are modeled correctly.
4. **Advocate Portal auth & privacy** — OAuth-connect (recommended) and opt-in
   vs. opt-out leaderboard (GDPR).
