# Attrakt — Site Map & UI Plan

**Date:** 2026-06-21
**Status:** Draft v2 (refined after scope decisions)
**Scope:** Information architecture, surfaces, navigation, and screen inventory
for the Attrakt Community Intelligence Platform.

### Decisions locked in (2026-06-21)

- **Advocate Portal is in scope** as a distinct, external member-facing surface
  (`advocates.attrakt.io`) — not folded into the client app.
- **Onboarding is Attrakt-provisioned**, not self-serve. Attrakt connects a
  client's platforms and configures the workspace via the Ops Console; the client
  logs into a ready-to-use workspace. The client app therefore has **no
  platform-connection wizard** — it has a guided first-run *tour* instead, and
  platform connections are **read-only / request-a-change** for clients.
- **Next step:** refine this plan (no wireframes or code yet).

This plan is grounded in the existing data model (`Client`, `Member`,
`PlatformIdentity`, `Message`, `Event`, `Metric`, `Threat`) and the working
backend subsystems (ingestion, identity resolution, metrics, threat detection,
pulse digests). The frontend today is a single stub page (`apps/admin`), so this
is greenfield on the UI side.

---

## 1. Audiences & roles

You named three core audiences. Below they are formalized as **surfaces** (distinct
apps/scopes) and **roles** (permission sets within a surface), plus the additional
audiences I recommend adding.

### The three you named

| # | Audience | Surface | Scope | Primary job |
|---|----------|---------|-------|-------------|
| 1 | **Client** | Client Workspace | Single tenant | Onboard, monitor their community, find & nurture advocates |
| 2 | **Attrakt oversight** | Ops Console | Cross-tenant | Drive community/ecosystem growth across the whole client portfolio |
| 3 | **Master admin** | System Admin | Global / infra | Backend changes, provisioning, integrations, system health |

### Additional audiences I recommend (answering "Do you see any more?")

| # | Audience | Surface | Why it matters |
|---|----------|---------|----------------|
| 4 | **The advocate / community member** | Advocate Portal (external) ✅ **in scope** | This is the missing half of "advocacy." Today the platform watches advocates; it never *engages* them. A member-facing portal (rank, impact, badges, quests/rewards) turns passive measurement into an active advocacy loop and is a growth flywheel. |
| 5 | **Client sub-roles: Moderator & Viewer/Stakeholder** | Roles inside Client Workspace | A community manager, a moderator (threat queue only), and a founder/exec (read-only dashboards + reports) have very different needs. One "client login" is too coarse. |
| 6 | **Developer / integrator** | Developer Portal | API keys, webhooks, docs, usage. Already on the roadmap ("API Access"). Needed for clients who want to pipe data into their own tools. |
| 7 | **Prospect / public** | Marketing site + onboarding funnel | Landing, pricing, demo request, self-serve signup. The front door to surface #1. |

**Recommendation:** Build #1, #2, #3 first (your stated need), design #5 in from
day one as roles (cheap now, expensive to retrofit), and ship #4 (Advocate
Portal) as a confirmed external surface right after the core monitoring loop —
it directly serves the "advocate" goal you called out.

> **Provisioning model note:** Because onboarding is Attrakt-provisioned, the
> Ops Console (#2) is effectively a *prerequisite* for client value, not a
> later-phase nicety — Attrakt must be able to connect platforms and stand up a
> workspace before a client can use #1. This pulls the Ops Console's
> provisioning surface earlier in the build order (see §5).

### Role / permission matrix (within the Client Workspace)

| Capability | Owner/Admin | Community Mgr | Moderator | Viewer/Stakeholder |
|------------|:-----------:|:-------------:|:---------:|:------------------:|
| View dashboards & analytics | ✅ | ✅ | ◑ (own area) | ✅ |
| Member directory & profiles | ✅ | ✅ | ✅ | 👁️ read |
| Merge / edit identities | ✅ | ✅ | — | — |
| Advocate program & rewards | ✅ | ✅ | — | 👁️ read |
| Threat queue & moderation actions | ✅ | ✅ | ✅ | 👁️ read |
| Reports & exports | ✅ | ✅ | — | ✅ |
| Platform connections / credentials | ✅ | — | — | — |
| Team & billing | ✅ | — | — | — |

---

## 2. Surface architecture

Multi-tenant, so separate the surfaces by subdomain + auth scope rather than one
blended app:

```
attrakt.io               → Marketing site + onboarding funnel (public)
app.attrakt.io           → Client Workspace        (tenant-scoped)   [Audience 1, 5]
advocates.attrakt.io     → Advocate Portal          (member-scoped)   [Audience 4]  ✅ in scope
console.attrakt.io       → Attrakt Ops Console      (cross-tenant)    [Audience 2]
admin.attrakt.io         → System Admin             (global/infra)    [Audience 3]
developers.attrakt.io    → Developer/API portal     (tenant-scoped)   [Audience 6]  (proposed)
```

All share one design system and auth provider; scope + role gate what renders.
The existing `apps/admin` (Next.js + Tailwind) becomes the basis for the Client
Workspace; the Ops Console and System Admin are sibling apps in the monorepo.

---

## 3. Site maps

### 3.1 Client Workspace — `app.attrakt.io` (Audience 1)

**Onboarding flow (Attrakt-provisioned).** Platform connection and workspace
setup happen in the Ops Console *before* the client logs in (see §3.2). The
client never sees a connect-your-platforms wizard. Their first run is a short
guided tour of an already-live workspace:
1. `/invite/:token` → accept invite, set password / SSO
2. `/welcome` → guided tour: "Your community is already connected and being
   tracked." Highlights Overview, Members, Threats.
3. `/welcome/preferences` → confirm digest cadence & personal alert routing
   (Slack/email) — the *only* setup a client self-serves
4. `/welcome/team` → (Owner only) invite teammates with roles
5. → land on Overview, with a lightweight setup-health banner if anything Attrakt
   provisioned is still warming up (e.g. metrics not yet computed)

Clients can *view* connection status and *request changes* but cannot edit
credentials — those live with Attrakt (see `/settings/connections` below).

**Main navigation:**
```
/                         Overview / Pulse
  • Community health score, DAU/WAU/MAU tiles, sentiment gauge
  • Today's AI digest (pulse-agent output), anomalies, highlights
  • Open threats summary, top movers

/members                  Member directory
  /members/:id            Unified member profile
    • Cross-platform identities (Discord/GitHub/Twitter), match confidence
    • Engagement timeline, sentiment, first/last seen
    • Actions: merge identities, tag, add to segment
  /members/segments       Saved segments / filters

/advocates                Advocate program
  • Leaderboard (top contributors by cross-platform engagement)
  • Advocate tiers / super-users, "rising" advocates
  • Recognition & rewards (quests, points) [phase 2]
  /advocates/:id          Advocate detail (impact, history)

/analytics                Analytics
  • Time-series (DAU/volume/sentiment/growth), WoW & MoM
  • Platform breakdown tabs: Discord | GitHub | Twitter
  • Anomaly markers, export (CSV/PNG)

/threats                  Protection / threat queue
  • Queue filtered by severity (LOW→CRITICAL) & status
  • Status workflow: DETECTED → REVIEWING → ACTIONED → RESOLVED / FALSE_POSITIVE
  /threats/:id            Threat detail: evidence, context, member, actions

/reports                  Reports
  • Digest archive (daily/weekly), scheduled reports
  • Export PDF / Markdown

/settings                 Settings
  /settings/connections   Platform connections & health (read-only; "request a change" → Attrakt)
  /settings/team          Team & roles (Audience 5)
  /settings/alerts        Alert routing & thresholds
  /settings/digest        Digest preferences
  /settings/data          Export, retention, GDPR
  /settings/billing       Plan & billing
  /settings/api           API keys (links to Developer portal)
```

### 3.2 Attrakt Ops Console — `console.attrakt.io` (Audience 2)

Cross-tenant view for Attrakt's growth/success team. Same data, *portfolio* lens.

```
/                         Portfolio overview
  • All clients: health score, MAU, trend, churn-risk flags
  • Aggregate engagement & threat heatmap across communities

/clients                  Client list
  /clients/new            Provision a new client (Attrakt-led onboarding)
    • Create workspace, choose type, set plan
  /clients/:id            Client detail (usage, adoption, onboarding status)
    • "View as client" (impersonate, audit-logged)
  /clients/:id/setup      Provisioning console — connect platforms ON BEHALF of client
    • Discord: install bot → pick server & channels
    • GitHub: install GitHub App / webhook → pick repos/org
    • Twitter: authorize API → tracked accounts/keywords
    • Set digest cadence, alert routing, severity thresholds, seed team invites
    • Provisioning checklist → "ready to hand off" gate

/growth                   Ecosystem growth
  • Cross-community trends & benchmarks
  • Shared members/advocates across clients (network graph)
  • Cohort & retention comparisons

/success                  Account management
  • Onboarding/adoption funnel per client
  • At-risk alerts (low DAU, stalled setup, dropping sentiment)
  • Playbooks / outreach tasks

/threats                  Cross-client threat oversight
  • Coordinated attacks spanning communities, shared bad actors

/agents                   Agent operations
  • Pulse / threat-scan run history, quality, failures, costs
```

### 3.3 System Admin — `admin.attrakt.io` (Audience 3)

Infra / backend changes. Maps to operational gaps noted in the MVP audit
(queues, workers, identity merge tooling).

```
/                         System health
  • Queue status (BullMQ / Bull-Board), workers, ingestion lag
  • Job throughput & failures per platform

/tenants                  Tenant management
  • Create/suspend/delete clients, plan assignment

/users                    Users & RBAC
  • Global users, role definitions, permissions

/integrations            Platform integration config
  • API keys, webhook secrets, OAuth apps, rate limits

/data                     Data operations
  • Member/identity merge tooling, reprocessing, backfills
  • Soft-delete review (deletedAt / mergedIntoId)

/agents                   Agent & model config
  • Anthropic key, model selection, prompts, schedules

/flags                    Feature flags & plans

/audit                    Audit log (all admin & impersonation actions)
```

### 3.4 Advocate Portal — `advocates.attrakt.io` (Audience 4, ✅ in scope)

External, member-facing. Magic-link or OAuth (connect Discord/GitHub/Twitter).

```
/                         Your impact (rank, points, contribution summary)
/leaderboard             Community leaderboard & tiers
/quests                  Quests / rewards / badges [phase 2]
/profile                 Connected accounts, opt-in/out, privacy
```

### 3.5 Developer Portal — `developers.attrakt.io` (Audience 6, proposed)

```
/                         API keys & overview
/webhooks                Webhook endpoints & delivery logs
/docs                    API reference
/usage                   Request/usage metrics & limits
```

### 3.6 Marketing site — `attrakt.io` (Audience 7, proposed)

```
/  •  /features  •  /pricing  •  /use-cases  •  /demo (request)  •  /signup
```

---

## 4. Cross-cutting UI conventions

- **Shell:** left sidebar nav + top bar (workspace/tenant switcher, search,
  notifications, account). Ops Console & Admin reuse the shell with a different
  nav set and a global tenant switcher.
- **Design system:** shared component library (Tailwind, as in `apps/admin`) —
  metric tiles, time-series charts, sentiment gauge, data tables w/ filter+export,
  status badges (threat severity/status), member/identity cards, timeline.
- **Empty/loading states:** every analytics surface needs a "still collecting
  data" state — metrics only populate after ingestion + scheduled compute run.
- **Real-time:** threat alerts and digest-ready events via Redis pub/sub →
  notification center.
- **Auditability:** all impersonation ("view as client") and admin mutations
  logged to the audit surface.

---

## 5. Recommended build phases

Reordered to reflect the Attrakt-provisioned model: clients can't self-onboard,
so the Ops Console **provisioning surface** must exist before the client app
delivers value.

| Phase | Deliverable |
|-------|-------------|
| **0** | Design system + app shell (sidebar, tenant switcher, auth, RBAC scaffolding) |
| **1** | **Ops Console — provisioning** (`/clients/new`, `/clients/:id/setup`, connect platforms on behalf of client). Unblocks every client workspace. |
| **2** | Client Workspace: guided first-run tour, Overview/Pulse, Members + profiles, Threats queue, read-only Connections (the core monitoring loop) |
| **3** | Client: Analytics, Advocates (internal view), Reports; client sub-roles (Mod/Viewer) |
| **4** | Ops Console — portfolio + growth + success (cross-tenant lenses) |
| **5** | Advocate Portal (external, in scope) |
| **6** | System Admin (health, tenants, data ops, agents) |
| **7** | Developer Portal + Marketing site |

Note: Phase 1 analytics depend on the metrics pipeline actually running (see
`docs/MVP_GAP_AUDIT.md`) — worth confirming the scheduler/worker are live before
building analytics-heavy screens.

---

## 6. Resolved & remaining questions

**Resolved (2026-06-21):**
- ✅ Advocate Portal → distinct external surface, in scope.
- ✅ Onboarding → Attrakt-provisioned (Ops Console does setup; client gets a
  ready workspace).

**Still open:**
1. **Client sub-roles** — confirm the four roles (Owner / Community Mgr /
   Moderator / Viewer) match how your customers are organized, or adjust.
2. **Advocate Portal auth** — how do members authenticate? Magic link, or OAuth
   by connecting their Discord/GitHub/Twitter (which also strengthens identity
   resolution)? Recommend OAuth-connect.
3. **Advocate opt-in & privacy** — is appearing on a public leaderboard opt-in or
   opt-out? Affects GDPR posture and portal UX.
4. **Rewards in v1** — is the advocate program recognition-only (rank/badges) at
   launch, or do real rewards/quests ship in v1?
5. **Whether a client can ever self-edit connections** — currently read-only +
   "request a change." Confirm clients never need direct credential access.
</content>
</invoke>
