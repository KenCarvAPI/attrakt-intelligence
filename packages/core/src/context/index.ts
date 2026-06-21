/**
 * Context Engine (CE-0) — the integration + grounding layer.
 *
 * Connectors → normalize → structured store (items + embedded chunks) →
 * retrieval (queryContext) → grounding. See docs/CONTEXT_ENGINE.md.
 */

export * from './domains';
export * from './chunk';
export * from './similarity';
export * from './embeddings';
export * from './store';
export * from './query';
export * from './sync';
export * from './connectors/types';
export * from './connectors/registry';
