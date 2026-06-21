import 'server-only';
import { prisma } from '@attrakt/core/src/prisma';
import type { KnowledgeDocument } from '@prisma/client';

/*
 * Deterministic, offline generators for the dashboard's write actions.
 *
 * These mirror the exact JSON shapes produced by the real engine in
 * packages/agents (advocate briefs, context synthesis, campaign briefs) and
 * are intentionally Claude-free so the demo works without credentials — the
 * same design the agents use for their no-API-key fallback path.
 *
 * >>> INTEGRATION POINT <<<
 * When ANTHROPIC_API_KEY is configured, delegate to the agents instead:
 *   generateAdvocateBrief(), synthesiseContextProfile()+activateContextProfile(),
 *   generateCampaignBrief(). They return these same shapes, Claude-authored.
 */

const STOPWORDS = new Set(
  ('the a an and or of to for in on with is are be we our you your they it this that as at by ' +
    'from has have i me my so but if not no can will just about into out up new get got see').split(' ')
);

function topTopics(texts: string[], n = 4): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 4 || STOPWORDS.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// --- Advocate brief ---------------------------------------------------------
export async function regenerateBrief(clientId: string, memberId: string) {
  // Excluded (opted-out) and merged members do not get briefs.
  const member = await prisma.member.findFirst({
    where: { id: memberId, clientId, deletedAt: null, excluded: false },
    include: {
      platformIdentities: true,
      advocateScores: { orderBy: { period: 'desc' }, take: 1 },
      messages: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!member) throw new Error('member_not_found');

  const score = member.advocateScores[0];
  const name = member.displayName ?? member.platformIdentities[0]?.username ?? 'this member';
  const platforms = [...new Set(member.platformIdentities.map((p) => p.platform))];
  const topics = topTopics(member.messages.map((m) => m.content));
  const evidence = member.messages.slice(0, 3).map((m) => ({
    date: m.createdAt.toISOString().slice(0, 10),
    example: m.content.length > 160 ? `${m.content.slice(0, 157)}…` : m.content,
  }));

  const segment = score?.segment ?? 'LURKER';
  const composite = score?.compositeScore ?? 0;

  const content = {
    headline: `${name} — ${segment.toLowerCase()} advocate scoring ${composite.toFixed(0)}/100`,
    whoTheyAre: `${name} is a ${segment.toLowerCase()}-tier community member active across ${platforms
      .map((p) => p[0] + p.slice(1).toLowerCase())
      .join(', ')}. ${
      score
        ? `Their composite advocacy score is ${composite.toFixed(1)}, driven most by ${strongestComponent(score)}.`
        : 'No advocate score has been computed yet.'
    }`,
    activitySummary: score
      ? `Activity ${score.activityScore.toFixed(0)}, consistency ${score.consistencyScore.toFixed(0)}, breadth ${score.breadthScore.toFixed(0)}, influence ${score.influenceScore.toFixed(0)} (period ${score.period}).`
      : 'Limited recent activity on record.',
    topics: topics.length ? topics : ['community'],
    evidenceOfAdvocacy: evidence.length
      ? evidence
      : [{ date: new Date().toISOString().slice(0, 10), example: '(no messages on record)' }],
    suggestedNextAction:
      segment === 'CHAMPION' || segment === 'ADVOCATE'
        ? 'Invite to the contributor council and feature their work in the weekly digest.'
        : 'Send a personal thank-you and surface an on-ramp into governance or contributor channels.',
  };

  return prisma.advocateBrief.create({
    data: {
      memberId,
      clientId,
      brief: content as object,
      model: 'deterministic-fallback',
      promptVersion: 'admin.v1',
      contextProfileUsed: false,
    },
  });
}

function strongestComponent(score: {
  activityScore: number;
  consistencyScore: number;
  breadthScore: number;
  influenceScore: number;
  helpfulnessScore: number;
}): string {
  const entries: [string, number][] = [
    ['sustained activity', score.activityScore],
    ['consistency', score.consistencyScore],
    ['cross-platform breadth', score.breadthScore],
    ['influence', score.influenceScore],
    ['helpfulness', score.helpfulnessScore],
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// --- Context re-synthesis ---------------------------------------------------
function bullets(text: string, n = 6): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .slice(0, n);
}

function confidence(count: number, note: string) {
  return { level: count >= 2 ? 'high' : count === 1 ? 'medium' : 'low', note };
}

export async function resynthesiseContext(clientId: string) {
  const docs = await prisma.knowledgeDocument.findMany({ where: { clientId }, orderBy: { uploadedAt: 'asc' } });
  if (docs.length === 0) throw new Error('no_documents');

  const byType = (types: KnowledgeDocument['sourceType'][]) =>
    docs.filter((d) => types.includes(d.sourceType));
  const join = (ds: KnowledgeDocument[]) => ds.flatMap((d) => bullets(d.rawText));

  const products = byType(['product_docs', 'website', 'marketing_material']);
  const brand = byType(['brand_guidelines', 'marketing_material']);
  const audience = byType(['marketing_material', 'website', 'leadership_interview']);
  const marketing = byType(['marketing_material', 'leadership_interview', 'strategy_doc']);
  const strategy = byType(['leadership_interview', 'strategy_doc']);

  const sections = {
    products: {
      whatTheyAre: bullets(products[0]?.rawText ?? '')[0] ?? '',
      whoTheyServe: '',
      keyDifferentiators: join(products),
      confidence: confidence(products.length, `Synthesised from ${products.length} product/website source(s).`),
    },
    brandVoice: {
      tone: bullets(brand[0]?.rawText ?? '')[0] ?? '',
      vocabulary: join(brand),
      thingsTheyNeverSay: join(brand).filter((b) => /never|avoid|don'?t|no /i.test(b)),
      confidence: confidence(brand.length, `Based on ${brand.length} brand source(s).`),
    },
    audience: {
      icps: join(audience),
      communities: [],
      whereTheyLiveOnline: join(audience).filter((b) => /twitter|x |discord|forum|farcaster|reddit/i.test(b)),
      confidence: confidence(audience.length, `Based on ${audience.length} audience source(s).`),
    },
    marketingFunction: {
      teamShape: '',
      channelsInUse: join(marketing).filter((b) => /twitter|discord|forum|email|newsletter|content/i.test(b)),
      currentCampaigns: join(marketing),
      confidence: confidence(marketing.length, `Based on ${marketing.length} marketing source(s).`),
    },
    strategicDirection: {
      leadershipPriorities: join(strategy),
      positioning: bullets(strategy.find((s) => /position|category|credibl/i.test(s.rawText))?.rawText ?? '')[0] ?? '',
      upcomingBets: join(strategy).filter((b) => /will|plan|launch|expand|next|q[1-4]/i.test(b)),
      confidence: confidence(
        strategy.length,
        'leadership_interview and strategy_doc treated as authoritative for this section.'
      ),
    },
  };

  const latest = await prisma.contextProfile.findFirst({
    where: { clientId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  return prisma.$transaction(async (tx) => {
    await tx.contextProfile.updateMany({
      where: { clientId, status: 'active' },
      data: { status: 'archived' },
    });
    return tx.contextProfile.create({
      data: {
        clientId,
        version,
        status: 'active',
        products: sections.products as object,
        brandVoice: sections.brandVoice as object,
        audience: sections.audience as object,
        marketingFunction: sections.marketingFunction as object,
        strategicDirection: sections.strategicDirection as object,
      },
    });
  });
}

// --- Campaign brief ---------------------------------------------------------
export async function generateCampaign(clientId: string, objective: string) {
  const profile = await prisma.contextProfile.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { version: 'desc' },
  });

  // Exclude merged and opted-out members from campaign advocate selection.
  const members = await prisma.member.findMany({
    where: { clientId, deletedAt: null, excluded: false },
    include: {
      platformIdentities: { select: { platform: true, username: true } },
      advocateScores: { orderBy: { period: 'desc' }, take: 1 },
      messages: { take: 8, orderBy: { createdAt: 'desc' }, select: { content: true } },
    },
  });

  const advocates = members
    .map((m) => ({
      name: m.displayName ?? m.platformIdentities[0]?.username ?? `member-${m.id.slice(-6)}`,
      platform: String(m.platformIdentities[0]?.platform ?? 'UNKNOWN'),
      score: Math.round(m.advocateScores[0]?.compositeScore ?? 0),
      topics: topTopics(m.messages.map((x) => x.content), 3),
    }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((a) => ({
      name: a.name,
      platform: a.platform,
      score: a.score,
      why: `Composite score ${a.score}/100${a.topics.length ? `, vocal on ${a.topics.slice(0, 2).join(', ')}` : ''}.`,
    }));

  const grouped = await prisma.message.groupBy({
    by: ['platform', 'channelId'],
    where: { clientId },
    _count: { _all: true },
  });
  grouped.sort((a, b) => b._count._all - a._count._all);
  const channels = grouped.slice(0, 6).map((g, i) => ({
    channel: g.channelId ? `${g.platform}:${g.channelId}` : String(g.platform),
    priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low',
    rationale: `${g._count._all} ingested messages — active community surface`,
  }));

  const byPlatform = new Map<string, number>();
  for (const g of grouped) byPlatform.set(String(g.platform), (byPlatform.get(String(g.platform)) ?? 0) + g._count._all);
  const segments = [...byPlatform.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({ name: `${platform} community`, where: platform, rationale: `${count} messages ingested from ${platform}` }));

  const strategy = (profile?.strategicDirection as any) ?? {};
  const brand = (profile?.brandVoice as any) ?? {};
  const positioning =
    (typeof strategy.positioning === 'string' && strategy.positioning) ||
    "Position the campaign around the client's core differentiators.";
  const tone = (typeof brand.tone === 'string' && brand.tone) || 'on-brand, audience-appropriate';

  const messageAngles = [
    { angle: 'Pain-led', copy: `For teams who feel the pain — ${objective}.`, voiceCheck: `Tone: ${tone}.` },
    { angle: 'Proof-led', copy: 'Reliable by design. See it working, not hyped.', voiceCheck: 'Leads with proof, not adjectives.' },
    { angle: 'Community-led', copy: `Built with the people already shipping on us. ${objective}.`, voiceCheck: 'Activates real advocates; no hype language.' },
  ];

  const content = {
    objective,
    positioning,
    audienceFit: `This objective targets where the community is already active.`,
    segments,
    advocates,
    channels,
    messageAngles,
    generatedWith: 'deterministic-fallback',
    contextProfileVersion: profile?.version ?? null,
    runningWithoutContext: !profile,
  };

  return prisma.campaignBrief.create({ data: { clientId, objective, content: content as object } });
}
