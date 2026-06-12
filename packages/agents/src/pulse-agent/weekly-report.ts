/**
 * Weekly Ecosystem Health Report
 *
 * Produces a client-ready weekly report grounded in the client's
 * ContextProfile. All sections are computed deterministically from the
 * database so the report works without an LLM; when an Anthropic API key is
 * configured, Claude is used to polish the headline and recommended-action
 * prose (numbers and structure stay authoritative).
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { prisma, config, log } from '@attrakt/core';
import { getWeeklyHealthReportPrompt, WEEKLY_HEALTH_REPORT_VERSION } from '../prompts';
import { renderMarkdown, renderHtml } from './render';

// --- Structured report shape ------------------------------------------------

export interface MetricMovement {
  label: string;
  current: number;
  previous: number;
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
  note: string;
}

export interface Advocate {
  name: string;
  score: number;
  delta: number;
  reason: string;
}

export interface GovernanceHighlight {
  title: string;
  type: 'topic_created' | 'solution_accepted';
  member: string;
  url: string;
  note: string;
}

export interface Risk {
  type: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RecommendedAction {
  action: string;
  priority: string;
}

export interface WeeklyHealthReport {
  clientName: string;
  periodStart: string;
  periodEnd: string;
  version: string;
  headlineSummary: string;
  metricMovements: MetricMovement[];
  advocates: Advocate[];
  governanceHighlights: GovernanceHighlight[];
  risks: Risk[];
  recommendedActions: RecommendedAction[];
}

interface WeekWindow {
  start: Date;
  end: Date;
  prevStart: Date;
}

// --- Public entry point -----------------------------------------------------

export interface GenerateOptions {
  /** Reference date; the report covers the 7 days ending at this date. */
  date?: Date;
  /** Skip persistence and email delivery (used by the CLI's --dry-run). */
  dryRun?: boolean;
  /** Skip email delivery only. */
  noEmail?: boolean;
}

export async function generateWeeklyReport(
  clientId: string,
  options: GenerateOptions = {}
): Promise<{ report: WeeklyHealthReport; markdown: string; html: string }> {
  const ref = options.date ?? new Date();
  const end = startOfDay(ref);
  const start = addDays(end, -7);
  const prevStart = addDays(end, -14);
  const window: WeekWindow = { start, end, prevStart };

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { contextProfile: true },
  });

  const priorities =
    client.contextProfile?.strategicPriorities && client.contextProfile.strategicPriorities.length
      ? client.contextProfile.strategicPriorities
      : ['Grow active participation', 'Strengthen the contributor pipeline', 'Improve responsiveness'];

  // Pull the raw activity for both weeks once, then bucket in memory.
  const [messages, events, metrics] = await Promise.all([
    prisma.message.findMany({
      where: { clientId, createdAt: { gte: prevStart, lt: end } },
      select: { memberId: true, createdAt: true },
    }),
    prisma.event.findMany({
      where: { clientId, createdAt: { gte: prevStart, lt: end } },
      include: { member: { select: { displayName: true } } },
    }),
    prisma.metric.findMany({
      where: { clientId, createdAt: { gte: prevStart, lt: end } },
      select: { metricType: true, value: true, createdAt: true },
    }),
  ]);

  const memberNames = await loadMemberNames(clientId);

  const metricMovements = buildMetricMovements(metrics, window);
  const advocates = buildAdvocates(messages, events, memberNames, window);
  const governanceHighlights = buildGovernanceHighlights(events, window);
  const risks = buildRisks(messages, events, metricMovements, window);
  const recommendedActions = buildRecommendedActions(
    priorities,
    { advocates, governanceHighlights, risks }
  );

  let headlineSummary = composeHeadline(client.name, metricMovements, governanceHighlights, risks);

  const report: WeeklyHealthReport = {
    clientName: client.name,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    version: WEEKLY_HEALTH_REPORT_VERSION,
    headlineSummary,
    metricMovements,
    advocates,
    governanceHighlights,
    risks,
    recommendedActions,
  };

  // Optional LLM polish of the narrative (headline + action phrasing only).
  await enhanceWithClaude(report, client.name, priorities, {
    mission: client.contextProfile?.mission ?? null,
    audience: client.contextProfile?.audience ?? null,
  });

  const markdown = renderMarkdown(report);
  const html = renderHtml(report);

  if (!options.dryRun) {
    await prisma.report.create({
      data: {
        clientId,
        type: 'WEEKLY_HEALTH',
        version: report.version,
        periodStart: start,
        periodEnd: end,
        data: report as unknown as object,
        markdown,
        html,
      },
    });

    if (!options.noEmail) {
      await deliverReport(client.name, markdown, html);
    }
  }

  log.info(
    { clientId, periodStart: start.toISOString(), dryRun: Boolean(options.dryRun) },
    'Generated weekly health report'
  );

  return { report, markdown, html };
}

// --- Metric movements -------------------------------------------------------

type MetricRow = { metricType: string; value: number; createdAt: Date };

const METRIC_SPECS: Array<{
  type: string;
  label: string;
  agg: 'avg' | 'sum' | 'last';
  format: (n: number) => number;
  note: (delta: number, dir: string) => string;
}> = [
  {
    type: 'DAU',
    label: 'Daily active users (avg)',
    agg: 'avg',
    format: (n) => Math.round(n),
    note: (_d, dir) => (dir === 'down' ? 'core engagement softening' : 'engagement holding up'),
  },
  {
    type: 'WAU',
    label: 'Weekly active users',
    agg: 'last',
    format: (n) => Math.round(n),
    note: (_d, dir) => (dir === 'up' ? 'wider reach this week' : 'reach contracted'),
  },
  {
    type: 'MESSAGE_VOLUME',
    label: 'Message volume',
    agg: 'sum',
    format: (n) => Math.round(n),
    note: (_d, dir) => (dir === 'up' ? 'conversation up' : 'conversation cooling'),
  },
  {
    type: 'SENTIMENT_AVERAGE',
    label: 'Average sentiment',
    agg: 'avg',
    format: (n) => Math.round(n * 100) / 100,
    note: (_d, dir) => (dir === 'down' ? 'mood slipping' : 'mood positive'),
  },
  {
    type: 'MEMBER_COUNT',
    label: 'Member count',
    agg: 'last',
    format: (n) => Math.round(n),
    note: (_d, dir) => (dir === 'up' ? 'steady growth' : 'flat growth'),
  },
];

function buildMetricMovements(metrics: MetricRow[], w: WeekWindow): MetricMovement[] {
  const movements: MetricMovement[] = [];

  for (const spec of METRIC_SPECS) {
    const thisWeek = metrics.filter(
      (m) => m.metricType === spec.type && m.createdAt >= w.start && m.createdAt < w.end
    );
    const prevWeek = metrics.filter(
      (m) => m.metricType === spec.type && m.createdAt >= w.prevStart && m.createdAt < w.start
    );
    if (thisWeek.length === 0 && prevWeek.length === 0) continue;

    const current = spec.format(aggregate(thisWeek, spec.agg));
    const previous = spec.format(aggregate(prevWeek, spec.agg));
    const deltaPct =
      previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : 0;
    const direction: MetricMovement['direction'] =
      current > previous ? 'up' : current < previous ? 'down' : 'flat';

    movements.push({
      label: spec.label,
      current,
      previous,
      deltaPct,
      direction,
      note: spec.note(deltaPct, direction),
    });
  }

  return movements;
}

function aggregate(rows: MetricRow[], agg: 'avg' | 'sum' | 'last'): number {
  if (rows.length === 0) return 0;
  if (agg === 'sum') return rows.reduce((s, r) => s + r.value, 0);
  if (agg === 'avg') return rows.reduce((s, r) => s + r.value, 0) / rows.length;
  // last
  return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].value;
}

// --- Advocates (weekly contribution score & movement) -----------------------

const EVENT_WEIGHTS: Record<string, number> = {
  SOLUTION_ACCEPTED: 5,
  PULL_REQUEST_MERGED: 4,
  TOPIC_CREATED: 2,
  POST_CREATED: 1,
  ISSUE_OPENED: 1,
  PULL_REQUEST_OPENED: 2,
};

type EventRow = {
  memberId: string | null;
  eventType: string;
  eventData: unknown;
  createdAt: Date;
  member: { displayName: string | null } | null;
};

interface MemberWeek {
  messages: number;
  govTopics: number;
  govPosts: number;
  solutions: number;
  mergedPrs: number;
  score: number;
}

function emptyWeek(): MemberWeek {
  return { messages: 0, govTopics: 0, govPosts: 0, solutions: 0, mergedPrs: 0, score: 0 };
}

function buildAdvocates(
  messages: Array<{ memberId: string | null; createdAt: Date }>,
  events: EventRow[],
  names: Map<string, string>,
  w: WeekWindow
): Advocate[] {
  const inThis = (d: Date) => d >= w.start && d < w.end;
  const scores = new Map<string, { now: MemberWeek; prev: MemberWeek }>();
  const bucket = (id: string) => {
    if (!scores.has(id)) scores.set(id, { now: emptyWeek(), prev: emptyWeek() });
    return scores.get(id)!;
  };

  for (const m of messages) {
    if (!m.memberId) continue;
    const wk = inThis(m.createdAt) ? bucket(m.memberId).now : bucket(m.memberId).prev;
    wk.messages += 1;
    wk.score += 1;
  }

  for (const e of events) {
    if (!e.memberId) continue;
    const wk = inThis(e.createdAt) ? bucket(e.memberId).now : bucket(e.memberId).prev;
    const governance = isGovernance(e.eventData);
    wk.score += EVENT_WEIGHTS[e.eventType] ?? 1;
    if (governance && e.eventType === 'TOPIC_CREATED') wk.govTopics += 1;
    if (governance && e.eventType === 'POST_CREATED') wk.govPosts += 1;
    if (e.eventType === 'SOLUTION_ACCEPTED') wk.solutions += 1;
    if (e.eventType === 'PULL_REQUEST_MERGED') wk.mergedPrs += 1;
    if (governance) wk.score += 1; // governance bonus
  }

  const advocates: Advocate[] = [];
  for (const [memberId, { now, prev }] of scores) {
    if (now.score <= 0) continue;
    advocates.push({
      name: names.get(memberId) ?? 'Unknown',
      score: Math.round(now.score),
      delta: Math.round(now.score - prev.score),
      reason: describeAdvocate(now, now.score - prev.score),
    });
  }

  return advocates.sort((a, b) => b.score - a.score || b.delta - a.delta).slice(0, 5);
}

function describeAdvocate(wk: MemberWeek, delta: number): string {
  const parts: string[] = [];
  if (wk.messages) parts.push(`${wk.messages} posts`);
  if (wk.govTopics) parts.push(`${wk.govTopics} governance ${plural(wk.govTopics, 'topic')}`);
  if (wk.govPosts) parts.push(`${wk.govPosts} governance ${plural(wk.govPosts, 'reply', 'replies')}`);
  if (wk.solutions) parts.push(`${wk.solutions} accepted ${plural(wk.solutions, 'solution')}`);
  if (wk.mergedPrs) parts.push(`${wk.mergedPrs} merged ${plural(wk.mergedPrs, 'PR')}`);
  const trend = delta > 0 ? `up ${delta} pts WoW` : delta < 0 ? `down ${Math.abs(delta)} pts WoW` : 'steady WoW';
  return `${parts.join(', ') || 'active'} — ${trend}`;
}

// --- Governance highlights --------------------------------------------------

function buildGovernanceHighlights(events: EventRow[], w: WeekWindow): GovernanceHighlight[] {
  const highlights: GovernanceHighlight[] = [];

  for (const e of events) {
    if (e.createdAt < w.start || e.createdAt >= w.end) continue;
    if (!isGovernance(e.eventData)) continue;
    if (e.eventType !== 'TOPIC_CREATED' && e.eventType !== 'SOLUTION_ACCEPTED') continue;

    const data = (e.eventData ?? {}) as Record<string, unknown>;
    const member = e.member?.displayName ?? 'Unknown';
    const url = typeof data.url === 'string' ? data.url : '';

    if (e.eventType === 'TOPIC_CREATED') {
      highlights.push({
        title: typeof data.title === 'string' ? data.title : 'Governance topic',
        type: 'topic_created',
        member,
        url,
        note: 'new governance discussion opened',
      });
    } else {
      highlights.push({
        title:
          typeof data.title === 'string'
            ? data.title
            : `Accepted answer in topic #${String(data.topicId ?? '')}`,
        type: 'solution_accepted',
        member,
        url,
        note: 'question resolved by the community',
      });
    }
  }

  // Topics first, then solutions; cap at 6.
  return highlights
    .sort((a, b) => Number(a.type === 'solution_accepted') - Number(b.type === 'solution_accepted'))
    .slice(0, 6);
}

// --- Risks / anomalies ------------------------------------------------------

function buildRisks(
  messages: Array<{ memberId: string | null; createdAt: Date }>,
  events: EventRow[],
  movements: MetricMovement[],
  w: WeekWindow
): Risk[] {
  const risks: Risk[] = [];

  // 1. Falling active member-days (distinct active members summed per day).
  const activeNow = activeMemberDays(messages, w.start, w.end);
  const activePrev = activeMemberDays(messages, w.prevStart, w.start);
  if (activePrev > 0 && activeNow < activePrev) {
    const drop = Math.round(((activePrev - activeNow) / activePrev) * 100);
    risks.push({
      type: 'Falling active days',
      detail: `Active member-days fell to ${activeNow} from ${activePrev} (-${drop}%) — fewer members showing up day to day.`,
      severity: drop >= 25 ? 'high' : drop >= 10 ? 'medium' : 'low',
    });
  }

  // 2. Rising unanswered governance questions.
  const unansweredNow = unansweredQuestions(events, w.start, w.end);
  const unansweredPrev = unansweredQuestions(events, w.prevStart, w.start);
  if (unansweredNow > unansweredPrev) {
    risks.push({
      type: 'Rising unanswered questions',
      detail: `${unansweredNow} governance ${plural(unansweredNow, 'topic')} opened this week without an accepted answer, up from ${unansweredPrev} last week.`,
      severity: unansweredNow - unansweredPrev >= 3 ? 'high' : 'medium',
    });
  }

  // 3. Sentiment decline (if tracked).
  const sentiment = movements.find((m) => m.label.startsWith('Average sentiment'));
  if (sentiment && sentiment.direction === 'down' && sentiment.previous - sentiment.current >= 0.1) {
    risks.push({
      type: 'Sentiment decline',
      detail: `Average sentiment slipped to ${sentiment.current} from ${sentiment.previous} — worth a read of recent threads.`,
      severity: 'medium',
    });
  }

  return risks;
}

function activeMemberDays(
  messages: Array<{ memberId: string | null; createdAt: Date }>,
  start: Date,
  end: Date
): number {
  const perDay = new Map<string, Set<string>>();
  for (const m of messages) {
    if (!m.memberId || m.createdAt < start || m.createdAt >= end) continue;
    const day = m.createdAt.toISOString().slice(0, 10);
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day)!.add(m.memberId);
  }
  return [...perDay.values()].reduce((sum, set) => sum + set.size, 0);
}

function unansweredQuestions(events: EventRow[], start: Date, end: Date): number {
  const opened = new Set<string>();
  const solved = new Set<string>();
  for (const e of events) {
    const data = (e.eventData ?? {}) as Record<string, unknown>;
    const topicId = String(data.topicId ?? '');
    if (e.eventType === 'TOPIC_CREATED' && isGovernance(e.eventData)) {
      if (e.createdAt >= start && e.createdAt < end && topicId) opened.add(topicId);
    }
    if (e.eventType === 'SOLUTION_ACCEPTED' && topicId) solved.add(topicId);
  }
  return [...opened].filter((id) => !solved.has(id)).length;
}

// --- Recommended actions (always reference a strategic priority) ------------

function buildRecommendedActions(
  priorities: string[],
  ctx: { advocates: Advocate[]; governanceHighlights: GovernanceHighlight[]; risks: Risk[] }
): RecommendedAction[] {
  const p = [...priorities];
  while (p.length < 3) p.push(p[p.length - 1] ?? 'Grow active participation');

  const topAdvocate = ctx.advocates[0]?.name;
  const unanswered = ctx.risks.find((r) => r.type === 'Rising unanswered questions');
  const activeDrop = ctx.risks.find((r) => r.type === 'Falling active days');
  const govCount = ctx.governanceHighlights.filter((h) => h.type === 'topic_created').length;

  const actions: RecommendedAction[] = [
    {
      priority: p[0],
      action: govCount
        ? `Spotlight this week's ${govCount} new governance ${plural(govCount, 'thread')} in the next community update and tag undecided voters to drive turnout — directly serving "${p[0]}".`
        : `Seed two governance discussion prompts this week to rebuild proposal momentum — directly serving "${p[0]}".`,
    },
    {
      priority: p[1],
      action: topAdvocate
        ? `Personally thank ${topAdvocate} and the other top movers, and invite them into a contributor working group — advancing "${p[1]}".`
        : `Identify and onboard two rising contributors into a working group — advancing "${p[1]}".`,
    },
    {
      priority: p[2],
      action: unanswered
        ? `Triage the ${unanswered.detail.match(/^(\d+)/)?.[1] ?? 'open'} unanswered governance questions within 48h and assign owners — protecting "${p[2]}".`
        : activeDrop
          ? `Run a midweek office-hours session to reverse the dip in active days — protecting "${p[2]}".`
          : `Set a 24h first-response SLA on new questions to keep responsiveness high — protecting "${p[2]}".`,
    },
  ];

  return actions;
}

// --- Headline ---------------------------------------------------------------

function composeHeadline(
  clientName: string,
  movements: MetricMovement[],
  governance: GovernanceHighlight[],
  risks: Risk[]
): string {
  const up = movements.filter((m) => m.direction === 'up').sort((a, b) => b.deltaPct - a.deltaPct)[0];
  const govTopics = governance.filter((g) => g.type === 'topic_created').length;
  const solutions = governance.filter((g) => g.type === 'solution_accepted').length;
  const topRisk = [...risks].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];

  const s1 = up
    ? `${clientName} grew its reach this week, with ${up.label.toLowerCase()} up ${Math.abs(up.deltaPct)}% to ${up.current}.`
    : `${clientName} held steady this week across its core metrics.`;
  const s2 =
    govTopics || solutions
      ? `Governance stayed active with ${govTopics} new ${plural(govTopics, 'proposal thread')} and ${solutions} accepted ${plural(solutions, 'solution')}.`
      : `Governance was quiet, with little new proposal activity to report.`;
  const s3 = topRisk
    ? `The watch item is ${topRisk.type.toLowerCase()}: ${topRisk.detail.replace(/\.$/, '')}, and the actions below address it.`
    : `No material risks surfaced, so the focus shifts to compounding this momentum.`;

  return `${s1} ${s2} ${s3}`;
}

// --- Claude polish ----------------------------------------------------------

async function enhanceWithClaude(
  report: WeeklyHealthReport,
  clientName: string,
  priorities: string[],
  ctx: { mission: string | null; audience: string | null }
): Promise<void> {
  if (!config.anthropicApiKey) return;

  try {
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const { prompt } = getWeeklyHealthReportPrompt({
      clientName,
      mission: ctx.mission ?? 'Not specified',
      audience: ctx.audience ?? 'Community members',
      strategicPriorities: priorities.map((pr, i) => `  ${i + 1}. ${pr}`).join('\n'),
      periodStart: report.periodStart.slice(0, 10),
      periodEnd: report.periodEnd.slice(0, 10),
      metricMovements: report.metricMovements
        .map((m) => `- ${m.label}: ${m.current} (prev ${m.previous}, ${m.deltaPct >= 0 ? '+' : ''}${m.deltaPct}%)`)
        .join('\n'),
      advocates: report.advocates.map((a) => `- ${a.name}: score ${a.score} (Δ${a.delta}) — ${a.reason}`).join('\n'),
      governanceHighlights: report.governanceHighlights.map((g) => `- [${g.type}] ${g.title} by ${g.member}`).join('\n'),
      risks: report.risks.map((r) => `- [${r.severity}] ${r.type}: ${r.detail}`).join('\n'),
    });

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

    if (typeof json.headlineSummary === 'string' && json.headlineSummary.trim()) {
      report.headlineSummary = json.headlineSummary.trim();
    }
    if (Array.isArray(json.recommendedActions) && json.recommendedActions.length === 3) {
      report.recommendedActions = json.recommendedActions.map((a: RecommendedAction) => ({
        action: String(a.action),
        priority: String(a.priority),
      }));
    }
  } catch (error) {
    log.warn({ error }, 'Claude polish failed; using deterministic narrative');
  }
}

// --- Email delivery (existing Resend integration) ---------------------------

async function deliverReport(clientName: string, markdown: string, html: string): Promise<void> {
  if (!(config.resendApiKey && config.resendFromEmail && config.clientEmail)) {
    log.info({}, 'Resend not configured; skipping email delivery');
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.resendApiKey}`,
      },
      body: JSON.stringify({
        from: config.resendFromEmail,
        to: config.clientEmail,
        subject: `${clientName} — Weekly Ecosystem Health Report`,
        html,
        text: markdown,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}`);
    }
    log.info({ to: config.clientEmail }, 'Weekly report delivered via email');
  } catch (error) {
    log.error({ error }, 'Failed to deliver weekly report via email');
  }
}

// --- Small helpers ----------------------------------------------------------

async function loadMemberNames(clientId: string): Promise<Map<string, string>> {
  const members = await prisma.member.findMany({
    where: { clientId },
    select: { id: true, displayName: true },
  });
  return new Map(members.map((m) => [m.id, m.displayName ?? 'Unknown']));
}

function isGovernance(eventData: unknown): boolean {
  return Boolean(eventData && typeof eventData === 'object' && (eventData as Record<string, unknown>).governance);
}

function severityRank(s: Risk['severity']): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : pluralForm ?? `${singular}s`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}
