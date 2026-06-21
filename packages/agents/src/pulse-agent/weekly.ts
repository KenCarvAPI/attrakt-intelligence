/**
 * Weekly ecosystem health report (context-aware).
 *
 * Upgrades the pulse-agent from a daily digest to a weekly report worthy of a
 * client inbox, grounded in the client's active ContextProfile. All numbers are
 * computed deterministically from ingested data; Claude (when available) writes
 * the narrative and the strategy-grounded recommendations around those numbers,
 * with a high-quality deterministic fallback when no key is configured.
 *
 * Structure: headline (3 sentences), key metric movements, notable advocates
 * (top movers by score), governance highlights (Discourse-flagged events),
 * risks/anomalies, and 3 recommended actions referencing the client's strategic
 * priorities. Output is stored as structured JSON + rendered Markdown and
 * delivered by email via the existing Resend integration.
 */

import type { ContextProfile, Prisma } from '@prisma/client';
import {
  prisma,
  config,
  log,
  toPeriod,
  periodRange,
  loadActiveContextProfile,
  formatContextForPrompt,
  SCORABLE_MEMBER_WHERE,
  SCORABLE_MEMBER_RELATION,
} from '@attrakt/core';
import { callClaude, extractJson, isLLMAvailable, loadPrompt } from '../llm';

const PROMPT_VERSION = 'pulse-weekly-v1';

// Governance is a distinct signal: either an explicit governance event type or a
// Discourse post flagged governance during ingestion (Phase 4).
const GOVERNANCE_EVENT_TYPES = [
  'GOVERNANCE_POST',
  'GOVERNANCE_VOTE',
  'GOVERNANCE_PROPOSAL',
] as const;

export interface MetricMovement {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
  comment?: string;
}

export interface NotableAdvocate {
  name: string;
  segment: string;
  score: number;
  scoreDelta: number;
  why: string;
}

export interface GovernanceHighlight {
  title: string;
  detail: string;
}

export interface DigestRisk {
  risk: string;
  detail: string;
}

export interface RecommendedAction {
  action: string;
  rationale: string;
}

export interface WeeklyDigestContent {
  period: string;
  generatedWith: 'claude' | 'deterministic-fallback';
  runningWithoutContext: boolean;
  contextProfileVersion: number | null;
  headline: string;
  metricMovements: MetricMovement[];
  notableAdvocates: NotableAdvocate[];
  governanceHighlights: GovernanceHighlight[];
  risks: DigestRisk[];
  recommendedActions: RecommendedAction[];
}

// --- helpers ---------------------------------------------------------------

function round(n: number, d = 1): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function movement(label: string, current: number, previous: number, decimals = 0): MetricMovement {
  const delta = round(current - previous, Math.max(decimals, 1));
  const deltaPct = previous > 0 ? round((delta / previous) * 100, 0) : current > 0 ? 100 : 0;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return { label, current: round(current, decimals), previous: round(previous, decimals), delta, deltaPct, direction };
}

function profileSection(profile: ContextProfile | null, key: keyof ContextProfile): Record<string, unknown> {
  if (!profile) return {};
  const v = profile[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function strongestComponent(s: {
  activityScore: number;
  consistencyScore: number;
  breadthScore: number;
  influenceScore: number;
  helpfulnessScore: number;
}): string {
  const parts: Array<[string, number]> = [
    ['activity', s.activityScore],
    ['consistency', s.consistencyScore],
    ['breadth', s.breadthScore],
    ['influence', s.influenceScore],
    ['helpfulness', s.helpfulnessScore],
  ];
  parts.sort((a, b) => b[1] - a[1]);
  return parts[0][0];
}

// --- data gathering --------------------------------------------------------

export interface WeeklyDigestData {
  period: string;
  priorPeriod: string;
  window: { start: Date; end: Date };
  metricMovements: MetricMovement[];
  notableAdvocates: NotableAdvocate[];
  governanceHighlights: GovernanceHighlight[];
  risks: DigestRisk[];
  hadPriorScores: boolean;
}

async function distinctActiveDays(clientId: string, start: Date, end: Date): Promise<number> {
  const rows = await prisma.message.findMany({
    where: { clientId, createdAt: { gte: start, lt: end } },
    select: { createdAt: true },
  });
  const days = new Set(rows.map((r) => r.createdAt.toISOString().slice(0, 10)));
  return days.size;
}

async function avgSentiment(clientId: string, start: Date, end: Date): Promise<number> {
  const rows = await prisma.message.findMany({
    where: { clientId, createdAt: { gte: start, lt: end }, sentiment: { not: null } },
    select: { sentiment: true },
  });
  if (rows.length === 0) return 0;
  return rows.reduce((sum, r) => sum + (r.sentiment ?? 0), 0) / rows.length;
}

async function questionCount(clientId: string, start: Date, end: Date): Promise<number> {
  // Approximation: messages that read as questions. Reactions/replies aren't
  // reliably linked to a specific message, so we track question volume as a
  // proxy for "unanswered questions" pressure rather than true thread resolution.
  return prisma.message.count({
    where: { clientId, createdAt: { gte: start, lt: end }, content: { contains: '?' } },
  });
}

async function governanceCount(clientId: string, start: Date, end: Date): Promise<number> {
  return prisma.event.count({
    where: {
      clientId,
      createdAt: { gte: start, lt: end },
      OR: [
        { eventType: { in: GOVERNANCE_EVENT_TYPES as unknown as Prisma.EnumEventTypeFilter['in'] } },
        { eventData: { path: ['governance'], equals: true } },
      ],
    },
  });
}

/** Compute all structured digest data for the ISO week containing `referenceDate`. */
export async function gatherWeeklyData(
  clientId: string,
  referenceDate: Date = new Date()
): Promise<WeeklyDigestData> {
  const period = toPeriod(referenceDate);
  const { start, end } = periodRange(referenceDate);
  const priorStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const priorPeriod = toPeriod(new Date(start.getTime() - 1));

  const activeWhere = (s: Date, e: Date): Prisma.MemberWhereInput => ({
    clientId,
    ...SCORABLE_MEMBER_WHERE,
    messages: { some: { createdAt: { gte: s, lt: e } } },
  });

  const [
    activeNow, activePrev,
    newNow, newPrev,
    msgNow, msgPrev,
    govNow, govPrev,
    sentNow, sentPrev,
    daysNow, daysPrev,
    qNow, qPrev,
  ] = await Promise.all([
    prisma.member.count({ where: activeWhere(start, end) }),
    prisma.member.count({ where: activeWhere(priorStart, start) }),
    prisma.member.count({ where: { clientId, ...SCORABLE_MEMBER_WHERE, firstSeen: { gte: start, lt: end } } }),
    prisma.member.count({ where: { clientId, ...SCORABLE_MEMBER_WHERE, firstSeen: { gte: priorStart, lt: start } } }),
    prisma.message.count({ where: { clientId, createdAt: { gte: start, lt: end } } }),
    prisma.message.count({ where: { clientId, createdAt: { gte: priorStart, lt: start } } }),
    governanceCount(clientId, start, end),
    governanceCount(clientId, priorStart, start),
    avgSentiment(clientId, start, end),
    avgSentiment(clientId, priorStart, start),
    distinctActiveDays(clientId, start, end),
    distinctActiveDays(clientId, priorStart, start),
    questionCount(clientId, start, end),
    questionCount(clientId, priorStart, start),
  ]);

  const metricMovements: MetricMovement[] = [
    movement('Active members', activeNow, activePrev),
    movement('New members', newNow, newPrev),
    movement('Messages', msgNow, msgPrev),
    movement('Governance posts', govNow, govPrev),
    movement('Avg sentiment', round(sentNow, 2), round(sentPrev, 2), 2),
    movement('Active days', daysNow, daysPrev),
  ];

  // Notable advocates: top movers by score this week vs prior week.
  const currentScores = await prisma.advocateScore.findMany({
    where: { clientId, period, member: SCORABLE_MEMBER_RELATION },
    include: { member: { include: { platformIdentities: { take: 1 } } } },
    orderBy: { compositeScore: 'desc' },
    take: 40,
  });
  const priorScores = await prisma.advocateScore.findMany({
    where: { clientId, period: priorPeriod },
    select: { memberId: true, compositeScore: true },
  });
  const priorById = new Map(priorScores.map((s) => [s.memberId, s.compositeScore]));
  const hadPriorScores = priorScores.length > 0;

  const ranked = currentScores
    .map((s) => {
      const prior = priorById.get(s.memberId);
      const scoreDelta = prior != null ? round(s.compositeScore - prior, 1) : round(s.compositeScore, 1);
      const name = s.member.displayName || s.member.platformIdentities[0]?.username || `member-${s.memberId.slice(-6)}`;
      const isNew = prior == null;
      const why =
        `${s.segment.toLowerCase()} • composite ${round(s.compositeScore, 0)}/100, strongest on ${strongestComponent(s)}` +
        (isNew ? ' (new to scoring this week)' : scoreDelta >= 0 ? ` (+${scoreDelta} vs last week)` : ` (${scoreDelta} vs last week)`);
      return { name, segment: s.segment, score: round(s.compositeScore, 0), scoreDelta, why, _new: isNew };
    })
    // Top movers: by score delta when we have a prior week to compare; otherwise by composite.
    .sort((a, b) => (hadPriorScores ? b.scoreDelta - a.scoreDelta : b.score - a.score))
    .slice(0, 5)
    .map(({ _new, ...rest }) => rest);

  // Governance highlights from flagged events/messages in the window.
  const govEvents = await prisma.event.findMany({
    where: {
      clientId,
      createdAt: { gte: start, lt: end },
      OR: [
        { eventType: { in: GOVERNANCE_EVENT_TYPES as unknown as Prisma.EnumEventTypeFilter['in'] } },
        { eventData: { path: ['governance'], equals: true } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const govTitles = new Map<string, number>();
  for (const e of govEvents) {
    const data = (e.eventData ?? {}) as Record<string, unknown>;
    const title = typeof data.title === 'string' ? data.title : typeof data.topicTitle === 'string' ? data.topicTitle : null;
    if (title) govTitles.set(title, (govTitles.get(title) ?? 0) + 1);
  }
  const governanceHighlights: GovernanceHighlight[] = [...govTitles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({
      title,
      detail: `${count} governance ${count === 1 ? 'interaction' : 'interactions'} on the forum this week`,
    }));

  // Risks / anomalies.
  const risks: DigestRisk[] = [];
  if (activeNow < activePrev) {
    risks.push({
      risk: 'Falling active participation',
      detail: `Active members down ${activePrev - activeNow} week-on-week (${activePrev} → ${activeNow}).`,
    });
  }
  if (daysNow < daysPrev) {
    risks.push({
      risk: 'Fewer active days',
      detail: `Distinct active days fell from ${daysPrev} to ${daysNow}.`,
    });
  }
  if (round(sentNow, 2) < round(sentPrev, 2) - 0.1) {
    risks.push({
      risk: 'Sentiment softening',
      detail: `Average sentiment dropped from ${round(sentPrev, 2)} to ${round(sentNow, 2)}.`,
    });
  }
  if (qNow > qPrev && qNow > 0) {
    risks.push({
      risk: 'Rising unanswered questions',
      detail: `Question-shaped messages up ${qNow - qPrev} (${qPrev} → ${qNow}); check response coverage.`,
    });
  }
  if (risks.length === 0) {
    risks.push({
      risk: 'No material risks detected',
      detail: 'Activity, sentiment, and participation held steady or improved week-on-week.',
    });
  }

  return {
    period,
    priorPeriod,
    window: { start, end },
    metricMovements,
    notableAdvocates: ranked,
    governanceHighlights,
    risks,
    hadPriorScores,
  };
}

// --- digest assembly -------------------------------------------------------

function deterministicHeadline(data: WeeklyDigestData): string {
  const m = Object.fromEntries(data.metricMovements.map((x) => [x.label, x]));
  const active = m['Active members'];
  const msgs = m['Messages'];
  const gov = m['Governance posts'];
  const dir = (x?: MetricMovement) =>
    !x ? 'held steady' : x.direction === 'up' ? `rose ${x.deltaPct}%` : x.direction === 'down' ? `fell ${Math.abs(x.deltaPct)}%` : 'held flat';
  const topAdv = data.notableAdvocates[0];
  const risk = data.risks[0];
  return (
    `Active members ${dir(active)} to ${active?.current ?? 0} this week on ${msgs?.current ?? 0} messages. ` +
    `${topAdv ? `${topAdv.name} led the advocates (${topAdv.segment.toLowerCase()}, ${topAdv.score}/100)` : 'Advocate activity was quiet'}, ` +
    `with ${gov?.current ?? 0} governance ${(gov?.current ?? 0) === 1 ? 'interaction' : 'interactions'} on the forum. ` +
    `${risk?.risk === 'No material risks detected' ? 'No material risks surfaced this week.' : `Watch item: ${risk?.risk?.toLowerCase()}.`}`
  );
}

function deterministicActions(
  profile: ContextProfile | null,
  data: WeeklyDigestData
): RecommendedAction[] {
  const strat = profileSection(profile, 'strategicDirection');
  const priorities = [
    ...asArray(strat.leadershipPriorities),
    ...asArray(strat.upcomingBets),
    ...asArray(strat.positioning),
  ];
  const audience = profileSection(profile, 'audience');
  const icps = asArray(audience.icps);

  const topAdvocates = data.notableAdvocates.slice(0, 3).map((a) => a.name);
  const gov = data.metricMovements.find((x) => x.label === 'Governance posts');
  const topRisk = data.risks[0];

  if (!profile) {
    return [
      { action: `Personally thank this week's top advocates (${topAdvocates.join(', ') || 'top contributors'}).`, rationale: 'Running without a ContextProfile — recommendations are not grounded in client strategy. Synthesise a profile to sharpen these.' },
      { action: 'Triage the week\'s unanswered questions and assign owners.', rationale: 'Generic retention hygiene; not tied to a strategic priority.' },
      { action: 'Summarise governance activity for the wider community.', rationale: 'Generic engagement; ground in strategy once a profile exists.' },
    ];
  }

  return [
    {
      action: `Activate ${topAdvocates.slice(0, 2).join(' and ') || 'top advocates'} as champions around "${priorities[0] ?? 'the current strategic priority'}".`,
      rationale: `Their scores moved most this week; channel that into ${priorities[0] ?? 'the leadership priority'} where advocate voice compounds.`,
    },
    {
      action: `Convert this week's ${gov?.current ?? 0} governance interactions into a delegate-onboarding push.`,
      rationale: `Directly serves "${priorities[1] ?? priorities[0] ?? 'governance participation'}"${icps.length ? ` among ${icps[0]}` : ''}.`,
    },
    {
      action:
        topRisk.risk === 'No material risks detected'
          ? `Press the advantage: spotlight ${icps[0] ?? 'core builders'} stories tied to "${priorities[0] ?? 'positioning'}".`
          : `Address "${topRisk.risk.toLowerCase()}" before it compounds: ${topRisk.detail}`,
      rationale:
        topRisk.risk === 'No material risks detected'
          ? `Momentum is the moment to reinforce positioning with ${icps[0] ?? 'the core audience'}.`
          : `Protecting participation underpins every priority, including "${priorities[0] ?? 'growth'}".`,
    },
  ];
}

function deterministicContent(profile: ContextProfile | null, data: WeeklyDigestData): WeeklyDigestContent {
  return {
    period: data.period,
    generatedWith: 'deterministic-fallback',
    runningWithoutContext: !profile,
    contextProfileVersion: profile?.version ?? null,
    headline: deterministicHeadline(data),
    metricMovements: data.metricMovements.map((m) => ({
      ...m,
      comment: m.direction === 'up' ? 'up week-on-week' : m.direction === 'down' ? 'down week-on-week' : 'flat',
    })),
    notableAdvocates: data.notableAdvocates,
    governanceHighlights: data.governanceHighlights,
    risks: data.risks,
    recommendedActions: deterministicActions(profile, data),
  };
}

async function buildContent(
  profile: ContextProfile | null,
  data: WeeklyDigestData
): Promise<WeeklyDigestContent> {
  if (isLLMAvailable()) {
    try {
      const raw = await callClaude({
        system: 'You output only valid JSON matching the requested schema exactly. Never alter provided numbers.',
        user: loadPrompt('pulse-weekly-v1.md', {
          CONTEXT: formatContextForPrompt(profile),
          PERIOD: data.period,
          DATA: JSON.stringify(
            {
              metricMovements: data.metricMovements,
              notableAdvocates: data.notableAdvocates,
              governanceHighlights: data.governanceHighlights,
              risks: data.risks,
              hadPriorWeekScores: data.hadPriorScores,
            },
            null,
            2
          ),
        }),
        maxTokens: 4000,
      });
      const parsed = extractJson<Partial<WeeklyDigestContent>>(raw);
      return {
        period: data.period,
        generatedWith: 'claude',
        runningWithoutContext: !profile,
        contextProfileVersion: profile?.version ?? null,
        headline: parsed.headline ?? deterministicHeadline(data),
        metricMovements: parsed.metricMovements?.length ? parsed.metricMovements : data.metricMovements,
        notableAdvocates: parsed.notableAdvocates?.length ? parsed.notableAdvocates : data.notableAdvocates,
        governanceHighlights: parsed.governanceHighlights ?? data.governanceHighlights,
        risks: parsed.risks?.length ? parsed.risks : data.risks,
        recommendedActions: parsed.recommendedActions?.length
          ? parsed.recommendedActions
          : deterministicActions(profile, data),
      };
    } catch (error) {
      log.warn({ error }, 'LLM weekly digest failed; using deterministic fallback');
    }
  }
  return deterministicContent(profile, data);
}

// --- rendering -------------------------------------------------------------

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function renderMarkdown(c: WeeklyDigestContent): string {
  const lines: string[] = [];
  lines.push(`# Weekly Ecosystem Health — ${c.period}`);
  if (c.runningWithoutContext) lines.push(`> ⚠️ Running without an active ContextProfile — recommendations are not grounded in client strategy.`);
  lines.push('');
  lines.push(c.headline);
  lines.push('');
  lines.push('## 📊 Key metric movements');
  for (const m of c.metricMovements) {
    const arrow = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '—';
    lines.push(`- **${m.label}:** ${m.current} (${arrow} ${signed(m.delta)}, ${signed(m.deltaPct)}% vs prior week)${m.comment ? ` — ${m.comment}` : ''}`);
  }
  lines.push('');
  lines.push('## 👥 Notable advocates');
  if (c.notableAdvocates.length === 0) lines.push('- No scored advocates this week.');
  for (const a of c.notableAdvocates) {
    lines.push(`- **${a.name}** (${a.segment}, ${a.score}/100, ${signed(a.scoreDelta)}): ${a.why}`);
  }
  lines.push('');
  lines.push('## 🏛️ Governance highlights');
  if (c.governanceHighlights.length === 0) lines.push('- No governance activity flagged this week.');
  for (const g of c.governanceHighlights) lines.push(`- **${g.title}** — ${g.detail}`);
  lines.push('');
  lines.push('## ⚠️ Risks & anomalies');
  for (const r of c.risks) lines.push(`- **${r.risk}:** ${r.detail}`);
  lines.push('');
  lines.push('## 📋 Recommended actions');
  c.recommendedActions.forEach((a, i) => {
    lines.push(`${i + 1}. **${a.action}**`);
    lines.push(`   _Why:_ ${a.rationale}`);
  });
  lines.push('');
  lines.push(`_Generated ${c.generatedWith === 'claude' ? 'with Claude' : 'via deterministic fallback'}${c.contextProfileVersion ? ` · grounded in ContextProfile v${c.contextProfileVersion}` : ''}._`);
  return lines.join('\n');
}

// Email palette mirrors the dashboard (near-black canvas, indigo accent).
const C = {
  bg: '#0a0a0c', card: '#111114', text: '#f2f2f2', muted: '#8e8e99',
  indigo: '#818cf8', border: '#232327', emerald: '#6ee7b7', red: '#f87171',
};

export function renderHtml(c: WeeklyDigestContent): string {
  const color = (d: MetricMovement) => (d.direction === 'up' ? C.emerald : d.direction === 'down' ? C.red : C.muted);
  const arrow = (d: MetricMovement) => (d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '—');

  const metricRows = c.metricMovements
    .map(
      (m) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};color:${C.text};font-size:14px;">${m.label}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};color:${C.text};font-size:15px;font-weight:600;text-align:right;">${m.current}</td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${C.border};color:${color(m)};font-size:13px;text-align:right;white-space:nowrap;">${arrow(m)} ${signed(m.delta)} (${signed(m.deltaPct)}%)</td>
      </tr>`
    )
    .join('');

  const advocates = c.notableAdvocates
    .map(
      (a) => `
      <li style="margin:0 0 10px;color:${C.text};font-size:14px;line-height:1.5;">
        <strong>${a.name}</strong>
        <span style="color:${C.indigo};font-size:12px;">${a.segment} · ${a.score}/100 · ${signed(a.scoreDelta)}</span><br/>
        <span style="color:${C.muted};font-size:13px;">${a.why}</span>
      </li>`
    )
    .join('');

  const governance = c.governanceHighlights.length
    ? c.governanceHighlights
        .map((g) => `<li style="margin:0 0 8px;color:${C.text};font-size:14px;"><strong>${g.title}</strong><br/><span style="color:${C.muted};font-size:13px;">${g.detail}</span></li>`)
        .join('')
    : `<li style="color:${C.muted};font-size:14px;">No governance activity flagged this week.</li>`;

  const risks = c.risks
    .map((r) => `<li style="margin:0 0 8px;color:${C.text};font-size:14px;"><strong style="color:${r.risk.startsWith('No material') ? C.emerald : C.red};">${r.risk}</strong><br/><span style="color:${C.muted};font-size:13px;">${r.detail}</span></li>`)
    .join('');

  const actions = c.recommendedActions
    .map(
      (a, i) => `
      <li style="margin:0 0 14px;color:${C.text};font-size:14px;line-height:1.5;">
        <strong>${i + 1}. ${a.action}</strong><br/>
        <span style="color:${C.muted};font-size:13px;">Why: ${a.rationale}</span>
      </li>`
    )
    .join('');

  const section = (title: string, inner: string) => `
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:20px 22px;margin:0 0 16px;">
      <div style="color:${C.muted};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;">${title}</div>
      ${inner}
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="color:${C.indigo};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Attrakt Intelligence</div>
    <h1 style="color:${C.text};font-size:22px;font-weight:700;margin:6px 0 4px;">Weekly Ecosystem Health</h1>
    <div style="color:${C.muted};font-size:13px;margin:0 0 20px;">${c.period}${c.contextProfileVersion ? ` · grounded in ContextProfile v${c.contextProfileVersion}` : ''}</div>
    ${c.runningWithoutContext ? `<div style="background:#2a1a0a;border:1px solid #5a3a10;border-radius:10px;padding:12px 14px;color:#f4c27a;font-size:13px;margin:0 0 16px;">Running without an active ContextProfile — recommendations are not grounded in client strategy.</div>` : ''}
    <p style="color:${C.text};font-size:15px;line-height:1.6;margin:0 0 20px;">${c.headline}</p>
    ${section('Key metric movements', `<table style="width:100%;border-collapse:collapse;">${metricRows}</table>`)}
    ${section('Notable advocates', `<ul style="margin:0;padding:0;list-style:none;">${advocates || `<li style="color:${C.muted};">No scored advocates this week.</li>`}</ul>`)}
    ${section('Governance highlights', `<ul style="margin:0;padding:0;list-style:none;">${governance}</ul>`)}
    ${section('Risks & anomalies', `<ul style="margin:0;padding:0;list-style:none;">${risks}</ul>`)}
    ${section('Recommended actions', `<ol style="margin:0;padding:0;list-style:none;">${actions}</ol>`)}
    <div style="color:${C.muted};font-size:11px;text-align:center;margin:8px 0 0;">Generated ${c.generatedWith === 'claude' ? 'with Claude' : 'via deterministic fallback'}.</div>
  </div>
</body></html>`;
}

// --- delivery + orchestration ---------------------------------------------

async function deliverByEmail(clientId: string, period: string, html: string) {
  if (!(config.resendApiKey && config.resendFromEmail && config.clientEmail)) {
    log.info({ clientId }, 'Resend not configured; skipping weekly digest email');
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.resendApiKey}` },
      body: JSON.stringify({
        from: config.resendFromEmail,
        to: config.clientEmail,
        subject: `Weekly Ecosystem Health — ${period}`,
        html,
      }),
    });
    log.info({ clientId, to: config.clientEmail, period }, 'Weekly digest delivered via email');
  } catch (error) {
    log.error({ error, clientId }, 'Failed to deliver weekly digest email');
  }
}

export interface GenerateWeeklyDigestResult {
  content: WeeklyDigestContent;
  markdown: string;
  html: string;
}

/**
 * Generate, persist, and (if configured) email the weekly digest for a client.
 * Stores structured JSON + Markdown on the WeeklyDigest model (upsert per ISO
 * week) so it can be re-displayed or re-sent without regeneration.
 */
export async function generateWeeklyDigest(
  clientId: string,
  options: { referenceDate?: Date; deliver?: boolean } = {}
): Promise<GenerateWeeklyDigestResult> {
  const referenceDate = options.referenceDate ?? new Date();
  const profile = await loadActiveContextProfile(clientId);
  const data = await gatherWeeklyData(clientId, referenceDate);

  log.info(
    { clientId, period: data.period, hasContext: Boolean(profile), advocates: data.notableAdvocates.length },
    'Generating weekly digest'
  );

  const content = await buildContent(profile, data);
  const markdown = renderMarkdown(content);
  const html = renderHtml(content);

  await prisma.weeklyDigest.upsert({
    where: { clientId_period: { clientId, period: data.period } },
    create: { clientId, period: data.period, content: content as object, markdown },
    update: { content: content as object, markdown, createdAt: new Date() },
  });

  if (options.deliver !== false) {
    await deliverByEmail(clientId, data.period, html);
  }

  return { content, markdown, html };
}

export { PROMPT_VERSION };
