import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from './chunk';
import { cosineSimilarity, rankByCosine } from './similarity';
import { hashEmbedding, HashEmbeddingProvider } from './embeddings';
import { sourceTypeToDomain } from './domains';
import { itemContentHash } from './store';
import { buildGroundingBlock, type ContextSnippet } from './query';

describe('chunkText', () => {
  it('returns [] for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  it('splits long text into multiple bounded chunks', () => {
    const para = 'word '.repeat(200).trim(); // ~1000 chars
    const text = [para, para, para].join('\n\n'); // ~3000 chars
    const chunks = chunkText(text, { maxChars: 1200, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1200);
  });

  it('hard-splits a single oversized paragraph', () => {
    const huge = 'x'.repeat(5000);
    const chunks = chunkText(huge, { maxChars: 1000 });
    expect(chunks.length).toBe(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });
});

describe('estimateTokens', () => {
  it('approximates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('handles empty / mismatched / zero vectors as 0', () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('rankByCosine', () => {
  it('returns top-k highest-scoring candidates, ordered', () => {
    const q = [1, 0];
    const candidates = [
      { value: 'a', embedding: [0, 1] }, // orthogonal
      { value: 'b', embedding: [1, 0] }, // identical
      { value: 'c', embedding: [0.7, 0.7] }, // 45°
    ];
    const ranked = rankByCosine(q, candidates, 2);
    expect(ranked.map((r) => r.item)).toEqual(['b', 'c']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

describe('hashEmbedding', () => {
  const provider = new HashEmbeddingProvider();

  it('is deterministic and correctly dimensioned', () => {
    const a = hashEmbedding('attrakt community intelligence');
    const b = hashEmbedding('attrakt community intelligence');
    expect(a).toEqual(b);
    expect(a.length).toBe(provider.dimensions);
  });

  it('is L2-normalized for non-empty text', () => {
    const v = hashEmbedding('some meaningful tokens here');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('ranks a related query above an unrelated one', () => {
    const doc = hashEmbedding('quarterly marketing campaign launch plan and channels');
    const related = cosineSimilarity(hashEmbedding('marketing campaign launch'), doc);
    const unrelated = cosineSimilarity(hashEmbedding('database migration rollback script'), doc);
    expect(related).toBeGreaterThan(unrelated);
  });

  it('provider.embed preserves order and batch size', async () => {
    const out = await provider.embed(['one', 'two', 'three']);
    expect(out.length).toBe(3);
    expect(out[0]).toEqual(hashEmbedding('one'));
  });
});

describe('sourceTypeToDomain', () => {
  it('maps source types to the right domains', () => {
    expect(sourceTypeToDomain('product_docs')).toBe('PRODUCT');
    expect(sourceTypeToDomain('marketing_material')).toBe('MARKETING_OPS');
    expect(sourceTypeToDomain('brand_guidelines')).toBe('STRATEGY');
    expect(sourceTypeToDomain('leadership_interview')).toBe('STRATEGY');
    expect(sourceTypeToDomain('other')).toBe('STRATEGY');
  });
});

describe('itemContentHash', () => {
  it('is stable for identical input and differs on change', () => {
    const a = itemContentHash({ kind: 'document', title: 'X', text: 'hello' });
    const b = itemContentHash({ kind: 'document', title: 'X', text: 'hello' });
    const c = itemContentHash({ kind: 'document', title: 'X', text: 'changed' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('buildGroundingBlock', () => {
  const snippet = (text: string): ContextSnippet => ({
    text,
    score: 0.5,
    domain: 'PRODUCT',
    kind: 'release',
    title: 'v2.0',
    url: null,
    occurredAt: new Date('2026-06-01T00:00:00Z'),
    itemId: 'i1',
  });

  it('returns empty string for no snippets', () => {
    expect(buildGroundingBlock([], 1000)).toBe('');
  });

  it('labels snippets and respects the token budget', () => {
    const big = 'token '.repeat(400); // ~2400 chars ≈ 600 tokens
    const block = buildGroundingBlock([snippet(big), snippet(big), snippet(big)], 700);
    expect(block).toContain('RELEVANT CONTEXT');
    expect(block).toContain('[PRODUCT/release · v2.0 · 2026-06-01]');
    // With a 700-token budget, not all three ~600-token snippets fit.
    expect(estimateTokens(block)).toBeLessThanOrEqual(700);
  });
});
