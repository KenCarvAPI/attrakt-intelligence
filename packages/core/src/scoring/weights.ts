import type { ScoringWeights } from './types';

/**
 * Sensible default component weights. Influence and activity are weighted most
 * heavily because they are the strongest signals of genuine advocacy; breadth
 * and helpfulness are smaller contributors. These sum to 1.0 but the compute
 * path normalises regardless, so per-client overrides need not.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  activityWeight: 0.25,
  consistencyWeight: 0.2,
  breadthWeight: 0.15,
  influenceWeight: 0.3,
  helpfulnessWeight: 0.1,
};

/**
 * Normalise weights so they sum to 1. If every weight is zero (or negative sum),
 * fall back to the defaults rather than dividing by zero.
 */
export function normaliseWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.activityWeight +
    weights.consistencyWeight +
    weights.breadthWeight +
    weights.influenceWeight +
    weights.helpfulnessWeight;

  if (sum <= 0) {
    return normaliseWeights(DEFAULT_WEIGHTS);
  }

  return {
    activityWeight: weights.activityWeight / sum,
    consistencyWeight: weights.consistencyWeight / sum,
    breadthWeight: weights.breadthWeight / sum,
    influenceWeight: weights.influenceWeight / sum,
    helpfulnessWeight: weights.helpfulnessWeight / sum,
  };
}
