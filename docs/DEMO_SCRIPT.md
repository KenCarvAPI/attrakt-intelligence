# Demo Script — 15-minute walkthrough

The order, talking points, and best example members for a live screen-share. The
close is a live campaign-brief generation on the Context page. Run `pnpm seed:demo`
beforehand so the Gnosis instance is fully populated without live credentials.

**One-line value statement:** *Attrakt turns the community you already have into
the marketing engine you don't — grounded in what your business is actually
trying to do.*

---

## Before you start (off-screen)

- `pnpm seed:demo` — 200 members, 90 days of activity, scores, briefs, an active
  Context Profile, and a campaign brief.
- Log in at `/login` with the shared-secret password (`ADMIN_PASSWORD`).
- Open on `/gnosis` (the overview). Dark theme, full screen, zoom to ~110%.

---

## 1 · Overview (`/gnosis`) — ~3 min

**Value line:** *One honest read on ecosystem health across every platform.*

- Top row: **Active members, New members, Messages, Governance posts**, each with
  a signed delta vs the prior 30 days. Lead with the trend arrows, not the
  absolute numbers.
- **90-day activity chart** — point out messages vs engagement events (legend top
  right), and the consistent per-platform colour mapping used everywhere.
- **Segment distribution** — champions → lurkers. This is the advocacy pyramid;
  the next page is about the top of it.
- **Messages by platform** — note Discord/GitHub/Discourse all feed one unified
  picture (Discourse = governance).

## 2 · Members (`/gnosis/members`) — ~5 min

**Value line:** *Unified identities, scored — so you know exactly who to activate.*

- Sort by **Score** (default). Filter to **Champions** to show the top tier.
- Best example profiles to open (highest, most multi-platform scores from the
  seed): **the top one or two Champions in the table** — they have the richest
  cross-platform identity sets and full briefs.
- Open a Champion → slide-over panel:
  - **Linked platform identities** with resolution confidence — "one person,
    three platforms, automatically merged."
  - **Score breakdown** — activity, consistency, breadth, influence, helpfulness.
  - **Advocate brief** — who they are, what they care about, evidence, and a
    suggested next action. Hit **Regenerate brief** to show it is live.

## 3 · Context engine (`/gnosis/context`) — ~6 min (the close)

**Value line:** *This is why the outputs sound like you, not like generic
community advice.*

- **Active context profile** — walk the sections (products, brand voice,
  audience, marketing function, strategic direction) and call out the
  **per-section confidence notes**.
- **Knowledge documents** + **Add knowledge** — paste a short snippet or upload a
  file to show intake is upload/paste (no connectors needed).
- **The closer — generate a campaign brief live:** type an objective such as
  *"Drive awareness of the new payments product among DeFi developers"* and hit
  **Generate**. While the in-progress state runs, narrate what it is doing:
  pulling the right advocates, the channels where they live, and three message
  angles in the client's brand voice. Read out one angle.
- Land the plane: *"Every word of that was grounded in their own product and
  strategy, and pointed at their own top advocates. That is the whole product."*

---

## Notes

- If a number looks off live, it is real seeded data — lean into it ("this is
  computed, not mocked").
- Empty/loading/error states are handled, but the seed avoids them; do not delete
  the demo client mid-call.
- Keep to the three pages. There is deliberately no settings or admin surface in
  the demo.
