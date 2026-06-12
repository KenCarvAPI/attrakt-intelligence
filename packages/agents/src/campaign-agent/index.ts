/**
 * Campaign Brief Generator
 *
 * Bridges the two pillars: the internal knowledge layer (active ContextProfile)
 * and community intelligence (advocates / channels derived from ingestion data).
 *
 * Given a free-text objective it produces a structured CampaignBrief combining:
 *   - relevant context from the ContextProfile (positioning, voice, audience),
 *   - advocacy data: top-scoring advocates to activate, with one line each on why,
 *   - suggested channels based on where the community is actually active,
 *   - three message angles written in the client's brand voice.
 *
 * Community signals (advocates, channels, segments) are always computed from
 * real ingestion data. Claude (central model) selects/ranks and writes the
 * brand-voice copy; a deterministic fallback assembles the brief when no
 * ANTHROPIC_API_KEY is configured.
 */

import type { CampaignBrief, ContextProfile, Platform } from '@prisma/client';
import { prisma, log, loadActiveContextProfile, formatContextForPrompt } from '@attrakt/core';
import { callClaude, extractJson, isLLMAvailable, loadPrompt } from '../llm';

interface Advocate {
  name: string;
  platform: string;
  score: number;
  topics: string[];
  why: string;
}

interface ChannelSignal {
  channel: string;
  messageCount: number;
  rationale: string;
}

interface Segment {
  name: string;
  where: string;
  rationale: string;
}

export interface CommunitySignals {
  advocates: Advocate[];
  channels: ChannelSignal[];
  segments: Segment[];
}

export interface CampaignBriefResult {
  brief: CampaignBrief;
  usedLLM: boolean;
  hasContext: boolean;
  signals: CommunitySignals;
}

const STOPWORDS = new Set(
  ('the a an and or of to for in on with is are be we our you your they it this that ' +
    'as at by from has have i me my so but if not no can will just about into out up').split(' ')
);

function topicsFromText(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 4 || STOPWORDS.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
}

/** Compute advocacy, channel, and segment signals from ingestion data. */
export async function gatherCommunitySignals(clientId: string): Promise<CommunitySignals> {
  const members = await prisma.member.findMany({
    where: { clientId },
    include: {
      platformIdentities: true,
      messages: { take: 10, orderBy: { createdAt: 'desc' } },
      _count: { select: { messages: true, events: true } },
    },
  });

  const advocates: Advocate[] = members
    .map((m) => {
      const score = m._count.messages * 2 + m._count.events;
      const topics = topicsFromText(m.messages.map((msg) => msg.content));
      const platform = m.platformIdentities[0]?.platform ?? 'UNKNOWN';
      const handle =
        m.displayName || m.platformIdentities[0]?.username || `member-${m.id.slice(-6)}`;
      const avgSentiment =
        m.messages.length > 0
          ? m.messages.reduce((s, msg) => s + (msg.sentiment ?? 0), 0) / m.messages.length
          : 0;
      const why =
        `${m._count.messages} messages / ${m._count.events} events on ${platform}` +
        (topics.length ? `, vocal on ${topics.slice(0, 2).join(', ')}` : '') +
        (avgSentiment > 0.2 ? ', consistently positive sentiment' : '');
      return { name: handle, platform: String(platform), score, topics, why };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Channels: group messages by platform + channel.
  const grouped = await prisma.message.groupBy({
    by: ['platform', 'channelId'],
    where: { clientId },
    _count: { _all: true },
  });
  grouped.sort((a, b) => b._count._all - a._count._all);
  const channels: ChannelSignal[] = grouped.slice(0, 8).map((g) => {
    const channel = g.channelId ? `${g.platform}:${g.channelId}` : String(g.platform);
    return {
      channel,
      messageCount: g._count._all,
      rationale: `${g._count._all} ingested messages — active community surface`,
    };
  });

  // Segments: one per platform with activity.
  const byPlatform = new Map<string, number>();
  for (const c of channels) {
    const p = c.channel.split(':')[0];
    byPlatform.set(p, (byPlatform.get(p) ?? 0) + c.messageCount);
  }
  const segments: Segment[] = [...byPlatform.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({
      name: `${platform} community`,
      where: platform,
      rationale: `${count} messages ingested from ${platform}`,
    }));

  return { advocates, channels, segments };
}

function renderSignals(signals: CommunitySignals): string {
  const adv = signals.advocates.length
    ? signals.advocates
        .map(
          (a) =>
            `- ${a.name} (${a.platform}, score ${a.score}) — topics: ${
              a.topics.join(', ') || 'n/a'
            }; ${a.why}`
        )
        .join('\n')
    : '- (no advocates with activity found)';
  const chn = signals.channels.length
    ? signals.channels.map((c) => `- ${c.channel}: ${c.messageCount} messages`).join('\n')
    : '- (no channel activity found)';
  const seg = signals.segments.length
    ? signals.segments.map((s) => `- ${s.name} (${s.rationale})`).join('\n')
    : '- (no segments found)';
  return `### Top advocates\n${adv}\n\n### Active channels\n${chn}\n\n### Segments\n${seg}`;
}

// ---------------------------------------------------------------------------

function profileSection(profile: ContextProfile | null, key: keyof ContextProfile): any {
  if (!profile) return {};
  const v = profile[key];
  return v && typeof v === 'object' ? v : {};
}

function asText(value: unknown, fallback = ''): string {
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'string') return value;
  return fallback;
}

/** Deterministic brief assembled from context + signals (no LLM). */
function deterministicBrief(
  objective: string,
  profile: ContextProfile | null,
  signals: CommunitySignals
): Record<string, unknown> {
  const strategy = profileSection(profile, 'strategicDirection');
  const audience = profileSection(profile, 'audience');
  const brand = profileSection(profile, 'brandVoice');
  const products = profileSection(profile, 'products');

  const positioning =
    asText(strategy.positioning) ||
    'Position the campaign around the client\'s core differentiators.';
  const tone = asText(brand.tone, 'on-brand, audience-appropriate');
  const neverSay = (brand.thingsTheyNeverSay as string[]) ?? [];
  const differentiators = (products.keyDifferentiators as string[]) ?? [];

  const messageAngles = [
    {
      angle: 'Pain-led',
      copy: `${objective.replace(/^drive /i, 'For teams who feel the pain of ')} — ${
        differentiators[0] ?? 'built for builders'
      }.`,
      voiceCheck: `Tone: ${tone}. Avoids the never-say list${
        neverSay.length ? ` (${neverSay.slice(0, 2).join('; ')})` : ''
      }.`,
    },
    {
      angle: 'Proof-led',
      copy: `${differentiators[1] ?? 'Reliable by design'}. See it working, not hyped.`,
      voiceCheck: `Leads with proof, not adjectives — consistent with brand tone.`,
    },
    {
      angle: 'Community-led',
      copy: `Built with the people already shipping on us. ${objective}.`,
      voiceCheck: `Activates real advocates; no speculation or hype language.`,
    },
  ];

  return {
    objective,
    positioning,
    audienceFit:
      `Audience ICPs: ${asText(audience.icps, 'see profile')}. This objective targets where they already are.`,
    segments: signals.segments,
    advocates: signals.advocates.map((a) => ({
      name: a.name,
      platform: a.platform,
      score: a.score,
      why: a.why,
    })),
    channels: signals.channels.map((c, i) => ({
      channel: c.channel,
      priority: i === 0 ? 'high' : i < 3 ? 'medium' : 'low',
      rationale: c.rationale,
    })),
    messageAngles,
  };
}

async function buildBriefContent(
  objective: string,
  profile: ContextProfile | null,
  signals: CommunitySignals
): Promise<{ content: Record<string, unknown>; usedLLM: boolean }> {
  if (isLLMAvailable()) {
    try {
      const raw = await callClaude({
        system: 'You output only valid JSON matching the requested schema exactly.',
        user: loadPrompt('campaign-brief.v1.md', {
          CONTEXT: formatContextForPrompt(profile),
          OBJECTIVE: objective,
          SIGNALS: renderSignals(signals),
        }),
        maxTokens: 6000,
      });
      return { content: extractJson<Record<string, unknown>>(raw), usedLLM: true };
    } catch (error) {
      log.warn({ error }, 'LLM campaign brief failed; using deterministic fallback');
    }
  }
  return { content: deterministicBrief(objective, profile, signals), usedLLM: false };
}

/** Generate and persist a campaign brief for a client + objective. */
export async function generateCampaignBrief(
  clientId: string,
  objective: string
): Promise<CampaignBriefResult> {
  const profile = await loadActiveContextProfile(clientId);
  const signals = await gatherCommunitySignals(clientId);

  log.info(
    { clientId, hasContext: Boolean(profile), advocates: signals.advocates.length },
    'Generating campaign brief'
  );

  const { content, usedLLM } = await buildBriefContent(objective, profile, signals);

  // Annotate provenance so the stored brief is self-describing.
  content.generatedWith = usedLLM ? 'claude' : 'deterministic-fallback';
  content.contextProfileVersion = profile?.version ?? null;
  content.runningWithoutContext = !profile;

  const brief = await prisma.campaignBrief.create({
    data: { clientId, objective, content: content as object },
  });

  return { brief, usedLLM, hasContext: Boolean(profile), signals };
}
