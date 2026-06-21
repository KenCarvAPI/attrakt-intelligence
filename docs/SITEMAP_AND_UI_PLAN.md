# Attrakt — Site Map & UI Plan

**Date:** 2026-06-21
**Status:** Draft v1 (for review)
**Scope:** Information architecture, surfaces, navigation, and screen inventory
for the Attrakt Community Intelligence Platform.

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
| 4 | **The advocate / community member** | Advocate Portal (external) | This is the missing half of "advocacy." Today the platform watches advocates; it never *engages* them. A member-facing portal (rank, impact, badges, quests/rewards) turns passive measurement into an active advocacy loop and is a growth flywheel. |
| 5 | **Client sub-roles: Moderator & Viewer/Stakeholder** | Roles inside Client Workspace | A community manager, a moderator (threat queue only), and a founder/exec (read-only dashboards + reports) have very different needs. One "client login" is too coarse. |
| 6 | **Developer / integrator** | Developer Portal | API keys, webhooks, docs, usage. Already on the roadmap ("API Access"). Needed for clients who want to pipe data into their own tools. |
| 7 | **Prospect / public** | Marketing site + onboarding funnel | Landing, pricing, demo request, self-serve signup. The front door to surface #1. |

**Recommendation:** Build #1, #2, #3 first (your stated need), design #5 in from
day one as roles (cheap now, expensive to retrofit), and treat #4 (Advocate
Portal) as the highest-value *next* surface because it directly serves the
"advocate" goal you called out.

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
advocates.attrakt.io     → Advocate Portal          (member-scoped)   [Audience 4]  (proposed)
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

**Onboarding flow** (first run, wizard):
1. `/signup` or `/invite/:token` → create account / accept team invite
2. `/onboarding/workspace` → name community, choose type (dev / Web3 / SaaS / brand)
3. `/onboarding/connect` → connect platforms
   - Discord: install bot → pick server & channels
   - GitHub: install GitHub App / add webhook → pick repos/org
   - Twitter: authorize API → set tracked accounts/keywords
4. `/onboarding/preferences` → digest cadence, alert routing (Slack/email), severity thresholds
5. `/onboarding/team` → invite teammates with roles
6. `/onboarding/done` → "We're now tracking. First digest arrives tomorrow." → setup health checklist

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
  /settings/connections   Platform connections & health
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
  /clients/:id            Client detail (usage, adoption, onboarding status)
    • "View as client" (impersonate, audit-logged)

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

### 3.4 Advocate Portal — `advocates.attrakt.io` (Audience 4, proposed)

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

| Phase | Deliverable |
|-------|-------------|
| **0** | Design system + app shell (sidebar, tenant switcher, auth, RBAC scaffolding) |
| **1** | Client Workspace: Overview/Pulse, Members + profiles, Threats queue, Settings/Connections (the core monitoring loop) |
| **2** | Client: Analytics, Advocates, Reports; client sub-roles (Mod/Viewer) |
| **3** | Ops Console (portfolio + growth + success) |
| **4** | System Admin (health, tenants, data ops, agents) |
| **5** | Advocate Portal + Developer Portal + Marketing site |

Note: Phase 1 analytics depend on the metrics pipeline actually running (see
`docs/MVP_GAP_AUDIT.md`) — worth confirming the scheduler/worker are live before
building analytics-heavy screens.

---

## 6. Open questions for you

1. **Advocate Portal** — in scope as a distinct external surface, or fold a
   lightweight "advocate view" into the Client Workspace for now?
2. **Self-serve vs. white-glove onboarding** — should clients connect platforms
   themselves (full wizard), or does Attrakt provision for them (Ops Console
   does setup)? This changes how much onboarding UI we build first.
3. **Client sub-roles** — confirm the four roles (Owner / Community Mgr /
   Moderator / Viewer) match how your customers are organized.
4. **Which surface to wireframe first** — recommend Client Workspace Overview +
   Members, since that's the daily-use core.
</content>
</invoke>
