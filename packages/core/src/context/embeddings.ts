/**
 * Pluggable embedding provider for the Context Engine.
 *
 * Retrieval embeds chunk text once at ingest and the query intent at read time,
 * then ranks by cosine similarity. The provider is swappable:
 *
 *   - VoyageEmbeddingProvider — used when VOYAGE_API_KEY is set. Voyage AI is
 *     Anthropic's recommended embeddings partner (this stack is Claude-based and
 *     Anthropic does not ship a first-party embeddings API).
 *   - HashEmbeddingProvider — a deterministic, dependency-free local fallback so
 *     the pipeline (and tests/CI) run with no external calls or API key. It is a
 *     hashed bag-of-tokens projection, L2-normalized. It is NOT semantically
 *     strong — it exists to keep the system runnable and deterministic offline;
 *     set VOYAGE_API_KEY in real deployments for quality retrieval.
 *
 * The rest of the Context Engine depends only on the EmbeddingProvider interface,
 * so swapping providers (or moving similarity into pgvector) touches nothing else.
 */

import { log } from '../logger';

export interface EmbeddingProvider {
  /** Stable identifier, recorded so we can detect dimension/provider drift. */
  readonly id: string;
  /** Vector length this provider emits. */
  readonly dimensions: number;
  /** Embed a batch of texts, preserving order. */
  embed(texts: string[]): Promise<number[][]>;
}

const HASH_DIMENSIONS = 256;

/** Lowercase alphanumeric tokens; cheap and good enough for the hash fallback. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

/** FNV-1a 32-bit hash → bucket index. Deterministic across runs/machines. */
function bucket(token: string, dimensions: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % dimensions;
}

function l2normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Deterministic local embedding: hashed term frequencies, L2-normalized.
 * Exported for direct use in tests.
 */
export function hashEmbedding(text: string, dimensions = HASH_DIMENSIONS): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    vec[bucket(token, dimensions)] += 1;
  }
  return l2normalize(vec);
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly id = `hash-v1-${HASH_DIMENSIONS}`;
  readonly dimensions = HASH_DIMENSIONS;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbedding(t, this.dimensions));
  }
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions = 1024; // voyage-3 family default
  private readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model = 'voyage-3') {
    this.apiKey = apiKey;
    this.model = model;
    this.id = `voyage-${model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}

let cached: EmbeddingProvider | null = null;

/** Resolve the active provider once: Voyage when configured, else the hash fallback. */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const key = process.env.VOYAGE_API_KEY;
  if (key) {
    cached = new VoyageEmbeddingProvider(key, process.env.VOYAGE_MODEL || 'voyage-3');
  } else {
    log.warn(
      {},
      'VOYAGE_API_KEY not set — Context Engine using the deterministic hash embedding fallback (low retrieval quality). Set VOYAGE_API_KEY for production.'
    );
    cached = new HashEmbeddingProvider();
  }
  return cached;
}

/** Test seam: override the provider (e.g. inject a stub). */
export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  cached = provider;
}
