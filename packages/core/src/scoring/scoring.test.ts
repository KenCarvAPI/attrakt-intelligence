import { describe, it, expect } from 'vitest';
import {
  activityScore,
  consistencyScore,
  breadthScore,
  influenceScore,
  helpfulnessScore,
  compositeScore,
  scoreMember,
  clamp100,
} from './score';
import { assignSegments, segmentForTopFraction } from './segments';
import { normaliseWeights, DEFAULT_WEIGHTS } from './weights';
import { toPeriod } from './period';
import type { MemberScoringInput } from './types';

// --- Synthetic fixtures -----------------------------------------------------

/**
 * A high-volume spammer: floods one platform in a single burst and receives no
 * engagement in return.
 */
const SPAMMER: MemberScoringInput = {
  memberId: 'spammer',
  messageCount: 5000,
  eventCount: 200,
  distinctActiveDays: 2, // bursty: active on only 2 days in 90
  distinctPlatforms: 1, // one platform
  repliesReceived: 0, // nobody replies
  reactionsReceived: 0,
  messagesSent: 5000,
};

/**
 * A genuine advocate: moderate volume, shows up consistently, active across all
 * platforms, and is frequently replied to.
 */
const ADVOCATE: MemberScoringInput = {
  memberId: 'advocate',
  messageCount: 300,
  eventCount: 120,
  distinctActiveDays: 70, // present on 70 of 90 days
  distinctPlatforms: 3, // Discord + GitHub + Twitter
  repliesReceived: 600, // 2 replies per message sent
  reactionsReceived: 0,
  messagesSent: 300,
};

describe('component scores', () => {
  it('activity is log-scaled so raw volume does not dominate', () => {
    const spammerActivity = activityScore(SPAMMER.messageCount, SPAMMER.eventCount);
    const advocateActivity = activityScore(ADVOCATE.messageCount, ADVOCATE.eventCount);

    // The spammer sent ~12x the volume but, thanks to log scaling, leads on the
    // activity component by less than 1.3x rather than 12x.
    expect(spammerActivity).toBeGreaterThan(advocateActivity);
    expect(spammerActivity / advocateActivity).toBeLessThan(1.3);
  });

  it('consistency rewards regular presence over bursts', () => {
    expect(consistencyScore(70)).toBeGreaterThan(consistencyScore(2));
    expect(consistencyScore(90)).toBe(100);
    expect(consistencyScore(0)).toBe(0);
  });

  it('breadth rewards multi-platform presence', () => {
    expect(breadthScore(3)).toBe(100);
    expect(breadthScore(1)).toBeCloseTo(33.33, 1);
    expect(breadthScore(0)).toBe(0);
  });

  it('influence is zero without engagement received', () => {
    expect(influenceScore(0, 0, 5000)).toBe(0);
    expect(influenceScore(600, 0, 300)).toBe(100); // ratio 2.0, well above target
  });

  it('helpfulness is stubbed at 0 pending the Claude integration', () => {
    expect(helpfulnessScore()).toBe(0);
  });

  it('clamps component values into [0, 100]', () => {
    expect(clamp100(-5)).toBe(0);
    expect(clamp100(150)).toBe(100);
    expect(clamp100(NaN)).toBe(0);
  });
});

describe('composite scoring', () => {
  it('a spammer scores below a consistent, multi-platform, replied-to advocate', () => {
    const spammer = scoreMember(SPAMMER, DEFAULT_WEIGHTS);
    const advocate = scoreMember(ADVOCATE, DEFAULT_WEIGHTS);

    // The headline requirement.
    expect(advocate.compositeScore).toBeGreaterThan(spammer.compositeScore);

    // And by a clear margin, not a coin-flip.
    expect(advocate.compositeScore - spammer.compositeScore).toBeGreaterThan(20);

    // Surface the numbers in the test output for inspection.
    console.log(
      `spammer  composite=${spammer.compositeScore.toFixed(1)} ` +
        `(activity=${spammer.components.activityScore.toFixed(1)}, ` +
        `consistency=${spammer.components.consistencyScore.toFixed(1)}, ` +
        `breadth=${spammer.components.breadthScore.toFixed(1)}, ` +
        `influence=${spammer.components.influenceScore.toFixed(1)})`
    );
    console.log(
      `advocate composite=${advocate.compositeScore.toFixed(1)} ` +
        `(activity=${advocate.components.activityScore.toFixed(1)}, ` +
        `consistency=${advocate.components.consistencyScore.toFixed(1)}, ` +
        `breadth=${advocate.components.breadthScore.toFixed(1)}, ` +
        `influence=${advocate.components.influenceScore.toFixed(1)})`
    );
  });

  it('keeps the composite within [0, 100]', () => {
    const advocate = scoreMember(ADVOCATE, DEFAULT_WEIGHTS);
    expect(advocate.compositeScore).toBeGreaterThanOrEqual(0);
    expect(advocate.compositeScore).toBeLessThanOrEqual(100);
  });

  it('normalises weights that do not sum to 1', () => {
    const doubled = normaliseWeights({
      activityWeight: 0.5,
      consistencyWeight: 0.4,
      breadthWeight: 0.3,
      influenceWeight: 0.6,
      helpfulnessWeight: 0.2,
    });
    const sum =
      doubled.activityWeight +
      doubled.consistencyWeight +
      doubled.breadthWeight +
      doubled.influenceWeight +
      doubled.helpfulnessWeight;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('falls back to defaults when all weights are zero', () => {
    const fallback = normaliseWeights({
      activityWeight: 0,
      consistencyWeight: 0,
      breadthWeight: 0,
      influenceWeight: 0,
      helpfulnessWeight: 0,
    });
    // Equivalent to normalised defaults (which already sum to 1).
    expect(fallback).toEqual(normaliseWeights(DEFAULT_WEIGHTS));
  });
});

describe('segment assignment', () => {
  it('maps top fractions to the right buckets', () => {
    expect(segmentForTopFraction(0)).toBe('CHAMPION'); // very top
    expect(segmentForTopFraction(0.04)).toBe('CHAMPION'); // within top 5%
    expect(segmentForTopFraction(0.05)).toBe('ADVOCATE'); // next 15%
    expect(segmentForTopFraction(0.19)).toBe('ADVOCATE');
    expect(segmentForTopFraction(0.2)).toBe('ACTIVE'); // next 30%
    expect(segmentForTopFraction(0.49)).toBe('ACTIVE');
    expect(segmentForTopFraction(0.5)).toBe('CASUAL'); // next 30%
    expect(segmentForTopFraction(0.79)).toBe('CASUAL');
    expect(segmentForTopFraction(0.8)).toBe('LURKER'); // bottom 20%
    expect(segmentForTopFraction(0.99)).toBe('LURKER');
  });

  it('produces the expected distribution across 100 members', () => {
    // Distinct, descending scores so ranks are unambiguous.
    const scores = Array.from({ length: 100 }, (_, i) => ({
      memberId: `m${i}`,
      compositeScore: 100 - i, // m0 highest ... m99 lowest
    }));

    const segments = assignSegments(scores);
    const counts = { CHAMPION: 0, ADVOCATE: 0, ACTIVE: 0, CASUAL: 0, LURKER: 0 };
    for (const seg of segments.values()) counts[seg] += 1;

    expect(counts).toEqual({ CHAMPION: 5, ADVOCATE: 15, ACTIVE: 30, CASUAL: 30, LURKER: 20 });

    // The very top member is a champion; the very bottom is a lurker.
    expect(segments.get('m0')).toBe('CHAMPION');
    expect(segments.get('m99')).toBe('LURKER');
  });

  it('places the advocate above the spammer in a mixed cohort', () => {
    const advocate = scoreMember(ADVOCATE, DEFAULT_WEIGHTS);
    const spammer = scoreMember(SPAMMER, DEFAULT_WEIGHTS);
    // Pad with low-scoring lurkers so percentiles are meaningful.
    const lurkers = Array.from({ length: 18 }, (_, i) => ({
      memberId: `lurker${i}`,
      compositeScore: 1,
    }));

    const segments = assignSegments([
      { memberId: advocate.memberId, compositeScore: advocate.compositeScore },
      { memberId: spammer.memberId, compositeScore: spammer.compositeScore },
      ...lurkers,
    ]);

    const order = ['CHAMPION', 'ADVOCATE', 'ACTIVE', 'CASUAL', 'LURKER'];
    expect(order.indexOf(segments.get('advocate')!)).toBeLessThanOrEqual(
      order.indexOf(segments.get('spammer')!)
    );
  });

  it('returns an empty map for an empty cohort', () => {
    expect(assignSegments([]).size).toBe(0);
  });
});

describe('ISO-week period formatting', () => {
  it('formats dates as YYYY-Www', () => {
    // 2026-06-12 falls in ISO week 24.
    expect(toPeriod(new Date('2026-06-12T12:00:00Z'))).toBe('2026-W24');
    // 2026-01-01 is a Thursday -> ISO week 1.
    expect(toPeriod(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
  });
});

describe('composite weighting via compositeScore', () => {
  it('weights each component and stays bounded', () => {
    const components = {
      activityScore: 100,
      consistencyScore: 100,
      breadthScore: 100,
      influenceScore: 100,
      helpfulnessScore: 100,
    };
    // All-100 components must yield 100 regardless of weight split.
    expect(compositeScore(components, DEFAULT_WEIGHTS)).toBeCloseTo(100, 6);
  });
});
