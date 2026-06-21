import type { AdvocateSegment } from './types';

/**
 * Cumulative top-fraction cut-offs for each segment, per client:
 *   - champion: top 5%
 *   - advocate: next 15%  (cumulative top 20%)
 *   - active:   next 30%  (cumulative top 50%)
 *   - casual:   next 30%  (cumulative top 80%)
 *   - lurker:   the remaining bottom 20%
 *
 * A member's "top fraction" is the proportion of members scoring strictly higher
 * than them. The single best scorer has a top fraction of 0; ties share a top
 * fraction and therefore always land in the same segment.
 */
const SEGMENT_CUTOFFS: ReadonlyArray<{ maxTopFraction: number; segment: AdvocateSegment }> = [
  { maxTopFraction: 0.05, segment: 'CHAMPION' },
  { maxTopFraction: 0.2, segment: 'ADVOCATE' },
  { maxTopFraction: 0.5, segment: 'ACTIVE' },
  { maxTopFraction: 0.8, segment: 'CASUAL' },
];

/** Resolve a single member's segment from their top fraction in [0, 1). */
export function segmentForTopFraction(topFraction: number): AdvocateSegment {
  for (const { maxTopFraction, segment } of SEGMENT_CUTOFFS) {
    if (topFraction < maxTopFraction) return segment;
  }
  return 'LURKER';
}

/**
 * Assign a percentile-derived segment to every scored member, ranking by
 * composite score within the given cohort (i.e. per client + period).
 *
 * Returns a Map keyed by memberId. Members with equal composite scores receive
 * the same segment.
 */
export function assignSegments(
  scores: ReadonlyArray<{ memberId: string; compositeScore: number }>
): Map<string, AdvocateSegment> {
  const result = new Map<string, AdvocateSegment>();
  const n = scores.length;
  if (n === 0) return result;

  for (const member of scores) {
    const strictlyGreater = scores.filter(
      (other) => other.compositeScore > member.compositeScore
    ).length;
    const topFraction = strictlyGreater / n;
    result.set(member.memberId, segmentForTopFraction(topFraction));
  }

  return result;
}
