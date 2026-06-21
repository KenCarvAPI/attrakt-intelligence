/**
 * Text chunking for the Context Engine.
 *
 * Splits a document's narrative text into overlapping chunks sized for embedding
 * + retrieval. Splits on paragraph/sentence boundaries where possible so chunks
 * stay coherent, falling back to hard slicing for very long unbroken runs.
 */

export interface ChunkOptions {
  /** Target maximum characters per chunk (~4 chars/token → ~500 tokens at 2000). */
  maxChars?: number;
  /** Characters of overlap carried between consecutive chunks for continuity. */
  overlapChars?: number;
}

const DEFAULT_MAX = 2000;
const DEFAULT_OVERLAP = 200;

/** Rough token estimate (≈4 chars/token) — used only for budgeting, not billing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text into coherent, overlapping windows. Returns [] for empty input.
 * Guarantees every chunk is non-empty and within ~maxChars (a single oversized
 * paragraph is hard-split).
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULT_MAX);
  const overlap = Math.max(0, Math.min(options.overlapChars ?? DEFAULT_OVERLAP, maxChars - 1));

  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  // Split into paragraph-ish units, then greedily pack into chunks.
  const units = trimmed
    .split(/\n\s*\n/)
    .flatMap((p) => (p.length > maxChars ? hardSplit(p, maxChars) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (!current) {
      current = unit;
    } else if (current.length + 2 + unit.length <= maxChars) {
      current = `${current}\n\n${unit}`;
    } else {
      chunks.push(current);
      // Carry the tail of the previous chunk as overlap for continuity.
      const tail = overlap > 0 ? current.slice(-overlap) : '';
      current = tail ? `${tail}\n\n${unit}` : unit;
      // Guard against overlap pushing a chunk back over the cap.
      if (current.length > maxChars) current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Hard-split an oversized unbroken run into <=maxChars pieces. */
function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}
