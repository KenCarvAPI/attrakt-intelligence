/**
 * Identity matching utilities
 */

export interface MatchResult {
  matchMethod: 'explicit' | 'email' | 'username_exact' | 'username_fuzzy' | 'wallet';
  confidence: number; // 0-1
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Check if two usernames are a fuzzy match
 */
export function isFuzzyUsernameMatch(username1: string, username2: string, threshold = 2): boolean {
  const distance = levenshteinDistance(username1.toLowerCase(), username2.toLowerCase());
  return distance <= threshold;
}

/**
 * Normalize email for matching
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalize username for matching
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim().replace(/[@#]/g, '');
}
