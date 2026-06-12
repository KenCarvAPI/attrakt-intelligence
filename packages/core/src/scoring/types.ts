/**
 * Types for the advocate scoring module.
 *
 * The scoring maths (score.ts, segments.ts) is deliberately pure: it operates on
 * plain numeric inputs and has no dependency on Prisma or the database, so it can
 * be unit-tested with synthetic fixtures. The orchestration layer (compute.ts)
 * is responsible for turning database rows into these inputs.
 */

/** The five components that make up a composite advocate score. */
export interface ScoreComponents {
  /** Log-scaled volume of messages + events in the period. */
  activityScore: number;
  /** Distinct active days over the trailing 90-day window. */
  consistencyScore: number;
  /** Distinct platforms the unified member is active on. */
  breadthScore: number;
  /** Engagement received (replies/reactions) relative to messages sent. */
  influenceScore: number;
  /** Claude-evaluated helpfulness. Stubbed at 0 until the next prompt. */
  helpfulnessScore: number;
}

/** Per-component weights. Need not sum to 1; they are normalised at use. */
export interface ScoringWeights {
  activityWeight: number;
  consistencyWeight: number;
  breadthWeight: number;
  influenceWeight: number;
  helpfulnessWeight: number;
}

/**
 * Raw, per-member signals gathered from the database for a single period.
 * These are the inputs to the pure scoring functions.
 */
export interface MemberScoringInput {
  memberId: string;
  /** Messages sent by the member in the scoring period. */
  messageCount: number;
  /** Events attributed to the member in the scoring period. */
  eventCount: number;
  /** Distinct calendar days (UTC) the member was active in the trailing 90d. */
  distinctActiveDays: number;
  /** Distinct platforms the member is active on (DISCORD/GITHUB/TWITTER). */
  distinctPlatforms: number;
  /** Replies received on the member's messages (approximation of influence). */
  repliesReceived: number;
  /** Reactions received on the member's messages (0 if not ingested). */
  reactionsReceived: number;
  /** Messages sent — denominator for the influence ratio. */
  messagesSent: number;
}

/** A fully computed score for one member, ready to persist. */
export interface MemberScore {
  memberId: string;
  components: ScoreComponents;
  /** Weighted, normalised composite in [0, 100]. */
  compositeScore: number;
}

/** Percentile-derived membership buckets. Mirrors the Prisma AdvocateSegment enum. */
export type AdvocateSegment = 'CHAMPION' | 'ADVOCATE' | 'ACTIVE' | 'CASUAL' | 'LURKER';
