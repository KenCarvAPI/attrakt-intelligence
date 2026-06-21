/**
 * Advocate brief generator.
 *
 * Produces a structured, Claude-generated profile of a single member — who they
 * are across platforms, what they're active on, the topics they care about,
 * paraphrased evidence of advocacy, and a suggested next action for the
 * community team. Briefs are stored as JSON on the AdvocateBrief model.
 */
import { prisma, log, config, periodRange, consistencyWindowStart } from '@attrakt/core';
import type { AdvocateBrief } from '@prisma/client';
import { renderPrompt, BRIEF_PROMPT_VERSION } from '../prompts';
import { createClaude, parseJsonResponse, type CompleteFn } from '../claude';

/** The structured brief shape Claude is asked to return. */
export interface AdvocateBriefContent {
  headline: string;
  whoTheyAre: string;
  activitySummary: string;
  topics: string[];
  evidenceOfAdvocacy: { date: string; example: string }[];
  suggestedNextAction: string;
}

export interface GenerateBriefOptions {
  /**
   * Optional client Context Profile used as additional grounding for the brief.
   *
   * >>> INTEGRATION POINT <<<
   * The client Context Profile (the client's positioning, products, values, and
   * priorities) is built in a later phase. It is accepted here now so that, once
   * available, it can be injected verbatim to ground the brief in what the client
   * actually cares about. Until then callers omit it and the brief is grounded in
   * member activity alone.
   */
  context?: string;
  /** Injectable Claude call (defaults to the real API). */
  complete?: CompleteFn;
  /** Persist the brief to the AdvocateBrief table. Default true. */
  persist?: boolean;
  /** Max recent messages to include as evidence material. Default 40. */
  sampleSize?: number;
}

export interface GeneratedBrief {
  content: AdvocateBriefContent;
  record?: AdvocateBrief;
}

/** Gather and format the member data that grounds the brief. */
async function gatherBriefInputs(clientId: string, memberId: string, sampleSize: number) {
  // Excluded (opted-out) and merged members do not get briefs.
  const member = await prisma.member.findFirst({
    where: { id: memberId, clientId, deletedAt: null, excluded: false },
    include: { platformIdentities: true },
  });
  if (!member) {
    throw new Error(`Member ${memberId} not found for client ${clientId}`);
  }

  const [latestScore, messages] = await Promise.all([
    prisma.advocateScore.findFirst({
      where: { memberId, clientId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.message.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      take: sampleSize,
      select: { content: true, platform: true, createdAt: true },
    }),
  ]);

  // Trailing-90d activity for the summary line.
  const { end } = periodRange(new Date());
  const windowStart = consistencyWindowStart(end);
  const [windowMessages, windowEvents] = await Promise.all([
    prisma.message.findMany({
      where: { memberId, createdAt: { gte: windowStart, lt: end } },
      select: { createdAt: true, platform: true },
    }),
    prisma.event.findMany({
      where: { memberId, createdAt: { gte: windowStart, lt: end } },
      select: { platform: true },
    }),
  ]);

  const activeDays = new Set(windowMessages.map((m) => m.createdAt.toISOString().slice(0, 10)));
  const platforms = new Set<string>([
    ...windowMessages.map((m) => m.platform),
    ...windowEvents.map((e) => e.platform),
  ]);

  const identities =
    member.platformIdentities
      .map((pi) => `- ${pi.platform}: @${pi.username}${pi.displayName ? ` (${pi.displayName})` : ''}`)
      .join('\n') || '- (no linked platform identities)';

  const scoreSummary = latestScore
    ? `Composite advocate score ${latestScore.compositeScore.toFixed(1)}/100 (segment: ${latestScore.segment}). ` +
      `Components — activity ${latestScore.activityScore.toFixed(0)}, consistency ${latestScore.consistencyScore.toFixed(0)}, ` +
      `breadth ${latestScore.breadthScore.toFixed(0)}, influence ${latestScore.influenceScore.toFixed(0)}, ` +
      `helpfulness ${latestScore.helpfulnessScore.toFixed(0)} (period ${latestScore.period}).`
    : 'No advocate score computed yet.';

  const activitySummary =
    `Active on ${platforms.size} platform(s): ${[...platforms].join(', ') || 'none'}. ` +
    `${activeDays.size} active day(s) and ${windowMessages.length} message(s) in the trailing 90 days.`;

  const renderedMessages =
    messages
      .map((m) => `[${m.createdAt.toISOString().slice(0, 10)} ${m.platform}] ${m.content}`)
      .join('\n') || '(no messages on record)';

  return {
    displayName: member.displayName ?? member.platformIdentities[0]?.username ?? 'Unknown',
    identities,
    scoreSummary,
    activitySummary,
    renderedMessages,
  };
}

/** Generate (and by default persist) an advocate brief for a member. */
export async function generateAdvocateBrief(
  clientId: string,
  memberId: string,
  options: GenerateBriefOptions = {}
): Promise<GeneratedBrief> {
  const { context, complete = createClaude(), persist = true, sampleSize = 40 } = options;

  const inputs = await gatherBriefInputs(clientId, memberId, sampleSize);

  const contextProfile = context
    ? `Client context profile (background grounding — weight the brief toward what this client values):\n${context}\n`
    : '';

  const prompt = renderPrompt(BRIEF_PROMPT_VERSION, {
    contextProfile,
    displayName: inputs.displayName,
    identities: inputs.identities,
    scoreSummary: inputs.scoreSummary,
    activitySummary: inputs.activitySummary,
    messages: inputs.renderedMessages,
  });

  const raw = await complete(prompt, 1500);
  const content = parseJsonResponse<AdvocateBriefContent>(raw);

  let record: AdvocateBrief | undefined;
  if (persist) {
    record = await prisma.advocateBrief.create({
      data: {
        memberId,
        clientId,
        brief: content as unknown as object,
        model: config.claudeModel,
        promptVersion: BRIEF_PROMPT_VERSION,
        contextProfileUsed: Boolean(context),
      },
    });
  }

  log.info(
    { clientId, memberId, contextProfileUsed: Boolean(context), briefId: record?.id },
    'Generated advocate brief'
  );

  return { content, record };
}
