/**
 * Advocate-score orchestration.
 *
 * Turns database rows into the pure scoring inputs, runs the maths, assigns
 * percentile segments per client, and persists one AdvocateScore row per member
 * per ISO-week period. The maths itself lives in score.ts / segments.ts and is
 * intentionally free of any database dependency.
 */
import { prisma } from '../prisma';
import { log } from '../logger';
import type { AdvocateSegment, MemberScoringInput, ScoringWeights } from './types';
import { scoreMember } from './score';
import { assignSegments } from './segments';
import { DEFAULT_WEIGHTS } from './weights';
import { toPeriod, periodRange, consistencyWindowStart } from './period';
import { SCORABLE_MEMBER_WHERE } from '../services/members';

/** Summary returned to callers (CLI / worker) for logging. */
export interface ScoringRunSummary {
  clientId: string;
  period: string;
  membersScored: number;
  segmentCounts: Record<AdvocateSegment, number>;
}

/**
 * Load the per-client scoring weights, creating a ScoringConfig with sensible
 * defaults on first run.
 */
export async function getScoringWeights(clientId: string): Promise<ScoringWeights> {
  const cfg = await prisma.scoringConfig.upsert({
    where: { clientId },
    update: {},
    create: { clientId, ...DEFAULT_WEIGHTS },
  });

  return {
    activityWeight: cfg.activityWeight,
    consistencyWeight: cfg.consistencyWeight,
    breadthWeight: cfg.breadthWeight,
    influenceWeight: cfg.influenceWeight,
    helpfulnessWeight: cfg.helpfulnessWeight,
  };
}

/** Distinct UTC day keys (YYYY-MM-DD) from a list of timestamps. */
function distinctDayKeys(dates: Date[]): Set<string> {
  const days = new Set<string>();
  for (const d of dates) {
    days.add(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Gather the raw scoring signals for a single member over the given period and
 * trailing consistency window.
 */
async function gatherMemberInput(
  clientId: string,
  memberId: string,
  period: string,
  periodStart: Date,
  periodEnd: Date,
  windowStart: Date
): Promise<MemberScoringInput> {
  // Period activity: the member's own messages and events this week.
  const periodMessages = await prisma.message.findMany({
    where: { memberId, createdAt: { gte: periodStart, lt: periodEnd } },
    select: { platformMessageId: true },
  });
  const messageCount = periodMessages.length;
  const eventCount = await prisma.event.count({
    where: { memberId, createdAt: { gte: periodStart, lt: periodEnd } },
  });

  // Trailing window: distinct active days and distinct platforms.
  const [windowMessages, windowEvents] = await Promise.all([
    prisma.message.findMany({
      where: { memberId, createdAt: { gte: windowStart, lt: periodEnd } },
      select: { createdAt: true, platform: true },
    }),
    prisma.event.findMany({
      where: { memberId, createdAt: { gte: windowStart, lt: periodEnd } },
      select: { createdAt: true, platform: true },
    }),
  ]);

  const activeDays = distinctDayKeys([
    ...windowMessages.map((m) => m.createdAt),
    ...windowEvents.map((e) => e.createdAt),
  ]);
  const platforms = new Set<string>([
    ...windowMessages.map((m) => m.platform),
    ...windowEvents.map((e) => e.platform),
  ]);

  // Influence: replies received on this member's messages this period.
  //
  // We approximate "replies received" using threaded messages: any message whose
  // threadId points at one of this member's messages (by platform message id),
  // authored by someone else, counts as a reply received.
  //
  // LIMITATION: reactions received are NOT attributable to a message author with
  // the current schema — MESSAGE_REACTION events record the reactor (memberId),
  // not the authored message's owner. Until reactions are ingested with author
  // attribution, reactionsReceived is held at 0 and influence is approximated
  // from reply counts alone (per the spec).
  const threadKeys = periodMessages
    .map((m) => m.platformMessageId)
    .filter((k): k is string => Boolean(k));

  const repliesReceived =
    threadKeys.length > 0
      ? await prisma.message.count({
          where: {
            clientId,
            threadId: { in: threadKeys },
            NOT: { memberId },
          },
        })
      : 0;
  const reactionsReceived = 0; // see LIMITATION above

  // Helpfulness: read the Claude-evaluated rating cached for this member and
  // period, if the scoring agent has produced one. Absent → undefined → 0.
  const helpfulness = await prisma.helpfulnessEvaluation.findUnique({
    where: { memberId_period: { memberId, period } },
    select: { score: true },
  });

  return {
    memberId,
    messageCount,
    eventCount,
    distinctActiveDays: activeDays.size,
    distinctPlatforms: platforms.size,
    repliesReceived,
    reactionsReceived,
    messagesSent: messageCount,
    helpfulnessScore: helpfulness?.score,
  };
}

/**
 * Compute and persist advocate scores for every member of a client for the ISO
 * week containing `referenceDate` (defaults to now).
 */
export async function computeAdvocateScores(
  clientId: string,
  referenceDate: Date = new Date()
): Promise<ScoringRunSummary> {
  const period = toPeriod(referenceDate);
  const { start: periodStart, end: periodEnd } = periodRange(referenceDate);
  const windowStart = consistencyWindowStart(periodEnd);

  const weights = await getScoringWeights(clientId);

  // Exclude merged (deletedAt) and opted-out (excluded) members from scoring.
  const members = await prisma.member.findMany({
    where: { clientId, ...SCORABLE_MEMBER_WHERE },
    select: { id: true },
  });

  log.info({ clientId, period, members: members.length }, 'Computing advocate scores');

  // Score each member from their raw signals.
  const scored = [];
  for (const { id: memberId } of members) {
    const input = await gatherMemberInput(
      clientId,
      memberId,
      period,
      periodStart,
      periodEnd,
      windowStart
    );
    scored.push(scoreMember(input, weights));
  }

  // Percentile-based segmentation across the whole cohort.
  const segments = assignSegments(
    scored.map((s) => ({ memberId: s.memberId, compositeScore: s.compositeScore }))
  );

  const segmentCounts: Record<AdvocateSegment, number> = {
    CHAMPION: 0,
    ADVOCATE: 0,
    ACTIVE: 0,
    CASUAL: 0,
    LURKER: 0,
  };

  // Persist: one upserted row per member per period.
  for (const s of scored) {
    const segment = segments.get(s.memberId) ?? 'LURKER';
    segmentCounts[segment] += 1;

    await prisma.advocateScore.upsert({
      where: { memberId_period: { memberId: s.memberId, period } },
      update: {
        clientId,
        compositeScore: s.compositeScore,
        activityScore: s.components.activityScore,
        consistencyScore: s.components.consistencyScore,
        breadthScore: s.components.breadthScore,
        influenceScore: s.components.influenceScore,
        helpfulnessScore: s.components.helpfulnessScore,
        segment,
      },
      create: {
        memberId: s.memberId,
        clientId,
        period,
        compositeScore: s.compositeScore,
        activityScore: s.components.activityScore,
        consistencyScore: s.components.consistencyScore,
        breadthScore: s.components.breadthScore,
        influenceScore: s.components.influenceScore,
        helpfulnessScore: s.components.helpfulnessScore,
        segment,
      },
    });
  }

  const summary: ScoringRunSummary = {
    clientId,
    period,
    membersScored: scored.length,
    segmentCounts,
  };

  log.info({ ...summary }, 'Computed advocate scores');
  return summary;
}
