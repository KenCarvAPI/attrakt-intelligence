/**
 * Vector similarity for retrieval ranking.
 *
 * MVP computes cosine similarity in the application layer over candidate chunks
 * loaded from Postgres (embeddings stored as Float[]). This is O(candidates) per
 * query — fine at MVP volume and mirrors the existing in-memory fuzzy-identity
 * approach. The documented upgrade path is pgvector: store `embedding vector(N)`
 * and push `ORDER BY embedding <=> $query` into SQL, leaving callers unchanged.
 */

/** Cosine similarity in [-1, 1]; returns 0 when either vector is empty/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Rank candidates by cosine similarity to a query vector, returning the top-k
 * above an optional minimum score, highest first.
 */
export function rankByCosine<T>(
  query: number[],
  candidates: { value: T; embedding: number[] }[],
  k: number,
  minScore = 0
): Ranked<T>[] {
  return candidates
    .map((c) => ({ item: c.value, score: cosineSimilarity(query, c.embedding) }))
    .filter((r) => r.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
