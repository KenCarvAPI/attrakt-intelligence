/**
 * Basic sentiment analysis utilities
 * For MVP, using keyword-based approach. Can be enhanced with ML later.
 */

const POSITIVE_KEYWORDS = [
  'great',
  'awesome',
  'amazing',
  'excellent',
  'fantastic',
  'love',
  'thanks',
  'thank you',
  'helpful',
  'good',
  'nice',
  'cool',
  'perfect',
  'brilliant',
];

const NEGATIVE_KEYWORDS = [
  'bad',
  'terrible',
  'awful',
  'hate',
  'disappointed',
  'worst',
  'broken',
  'useless',
  'stupid',
  'annoying',
  'frustrated',
  'fail',
  'error',
  'bug',
  'issue',
];

/**
 * Basic keyword-based sentiment scoring
 * Returns a score from -1 (very negative) to 1 (very positive)
 */
export function calculateBasicSentiment(text: string): number {
  const lowerText = text.toLowerCase();
  let score = 0;

  // Count positive keywords
  const positiveMatches = POSITIVE_KEYWORDS.filter((keyword) => lowerText.includes(keyword)).length;
  score += positiveMatches * 0.2;

  // Count negative keywords
  const negativeMatches = NEGATIVE_KEYWORDS.filter((keyword) => lowerText.includes(keyword)).length;
  score -= negativeMatches * 0.2;

  // Normalize to -1 to 1 range
  return Math.max(-1, Math.min(1, score));
}

/**
 * Check if text is likely negative
 */
export function isNegative(text: string, threshold = -0.2): boolean {
  return calculateBasicSentiment(text) < threshold;
}
