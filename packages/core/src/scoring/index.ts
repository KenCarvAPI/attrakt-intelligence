/**
 * Advocate scoring module.
 *
 * - types.ts    — shared interfaces
 * - score.ts    — pure component + composite maths (no I/O, unit-tested)
 * - segments.ts — percentile-based segment assignment
 * - weights.ts  — default weights + normalisation
 * - period.ts   — ISO-week period helpers
 * - compute.ts  — database orchestration + persistence
 */
export * from './types';
export * from './weights';
export * from './score';
export * from './segments';
export * from './period';
export * from './compute';
