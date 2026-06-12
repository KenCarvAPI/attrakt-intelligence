/**
 * Pure advocate-scoring maths.
 *
 * Every function here takes plain numbers and returns a component score in the
 * range [0, 100]. There is no I/O and no Prisma dependency, which keeps the
 * maths unit-testable with synthetic fixtures (see scoring.test.ts).
 */
import type {
  MemberScoringInput,
  MemberScore,
  ScoreComponents,
  ScoringWeights,
} from './types';
import { normaliseWeights } from './weights';

// --- Tunable references -----------------------------------------------------

/**
 * Total messages + events that should map to a near-maximal activity score.
 * Activity is log-scaled against this reference so that a member with 5,000
 * messages does not score 16x a member with ~300 — high-volume spammers are
 * deliberately prevented from dominating on raw volume alone.
 */
export const ACTIVITY_REFERENCE = 1000;

/** Trailing window, in days, over which consistency (distinct active days) is measured. */
export const CONSISTENCY_WINDOW_DAYS = 90;

/** Number of platforms a member can be active on (Discord, GitHub, Twitter). */
export const TOTAL_PLATFORMS = 3;

/**
 * Engagement-received-per-message ratio that maps to a full influence score.
 * A ratio of 0.5 (one reply/reaction for every two messages sent) is treated as
 * excellent; anything at or above this caps out at 100.
 */
export const INFLUENCE_TARGET_RATIO = 0.5;

// --- Helpers ----------------------------------------------------------------

/** Clamp a value into the inclusive [0, 100] range. */
export function clamp100(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// --- Component scores -------------------------------------------------------

/**
 * Activity: log-scaled volume of messages and events in the period.
 *
 * We use log1p so that the marginal value of each additional message shrinks as
 * volume grows. This is the key defence against spammers: doubling raw volume
 * adds only a small amount once a member is already prolific.
 */
export function activityScore(messageCount: number, eventCount: number): number {
  const total = Math.max(0, messageCount) + Math.max(0, eventCount);
  if (total <= 0) return 0;
  const scaled = Math.log1p(total) / Math.log1p(ACTIVITY_REFERENCE);
  return clamp100(scaled * 100);
}

/**
 * Consistency: distinct active days over the trailing 90-day window, as a
 * percentage of the window. Rewards members who show up regularly rather than
 * in a single burst.
 */
export function consistencyScore(
  distinctActiveDays: number,
  windowDays: number = CONSISTENCY_WINDOW_DAYS
): number {
  if (windowDays <= 0) return 0;
  const days = Math.max(0, Math.min(distinctActiveDays, windowDays));
  return clamp100((days / windowDays) * 100);
}

/**
 * Breadth: how many distinct platforms the unified member is active on, as a
 * percentage of the platforms we track. A member present across Discord, GitHub
 * and Twitter scores 100.
 */
export function breadthScore(
  distinctPlatforms: number,
  totalPlatforms: number = TOTAL_PLATFORMS
): number {
  if (totalPlatforms <= 0) return 0;
  const platforms = Math.max(0, Math.min(distinctPlatforms, totalPlatforms));
  return clamp100((platforms / totalPlatforms) * 100);
}

/**
 * Influence: engagement received relative to messages sent.
 *
 * Ideally this counts replies AND reactions received. Reactions are only present
 * once MESSAGE_REACTION events are ingested with attribution back to the
 * authoring member; until then `reactionsReceived` will be 0 and influence is
 * approximated from reply counts alone. This limitation is noted at the call
 * site in compute.ts.
 *
 * The score is an engagement ratio (received / sent) measured against
 * INFLUENCE_TARGET_RATIO. A member who sends 5,000 messages but receives no
 * engagement scores 0 here, which is what keeps spammers down.
 */
export function influenceScore(
  repliesReceived: number,
  reactionsReceived: number,
  messagesSent: number
): number {
  const received = Math.max(0, repliesReceived) + Math.max(0, reactionsReceived);
  if (received <= 0 || messagesSent <= 0) return 0;
  const ratio = received / messagesSent;
  return clamp100((ratio / INFLUENCE_TARGET_RATIO) * 100);
}

/**
 * Helpfulness: a Claude-evaluated component judging how genuinely helpful a
 * member's contributions are (answering questions, unblocking others, etc).
 *
 * >>> INTEGRATION POINT <<<
 * Deferred to the next prompt. This is intentionally stubbed at 0. The Claude
 * integration will live in packages/agents (alongside the pulse/threat agents,
 * which already construct an Anthropic client) and feed its result in via
 * MemberScoringInput, replacing this stub. Keeping it at 0 here means the
 * component contributes nothing until that work lands.
 */
export function helpfulnessScore(): number {
  return 0;
}

// --- Composite --------------------------------------------------------------

/**
 * Weighted sum of the component scores. Each component is already in [0, 100]
 * and the weights are normalised to sum to 1, so the result is also in [0, 100].
 */
export function compositeScore(
  components: ScoreComponents,
  weights: ScoringWeights
): number {
  const w = normaliseWeights(weights);
  const composite =
    components.activityScore * w.activityWeight +
    components.consistencyScore * w.consistencyWeight +
    components.breadthScore * w.breadthWeight +
    components.influenceScore * w.influenceWeight +
    components.helpfulnessScore * w.helpfulnessWeight;
  return clamp100(composite);
}

/**
 * Compute every component plus the composite for a single member from raw
 * signals. This is the one entry point the orchestration layer needs.
 */
export function scoreMember(
  input: MemberScoringInput,
  weights: ScoringWeights
): MemberScore {
  const components: ScoreComponents = {
    activityScore: activityScore(input.messageCount, input.eventCount),
    consistencyScore: consistencyScore(input.distinctActiveDays),
    breadthScore: breadthScore(input.distinctPlatforms),
    influenceScore: influenceScore(
      input.repliesReceived,
      input.reactionsReceived,
      input.messagesSent
    ),
    helpfulnessScore: helpfulnessScore(),
  };

  return {
    memberId: input.memberId,
    components,
    compositeScore: compositeScore(components, weights),
  };
}
