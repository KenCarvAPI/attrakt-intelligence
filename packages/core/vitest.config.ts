import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure scoring maths is unit-tested; it has no database dependency.
    include: ['src/**/*.test.ts'],
    // merge-member.test.ts uses the node:test runner (pnpm test:integration).
    exclude: ['**/node_modules/**', '**/dist/**', '**/merge-member.test.ts'],
    environment: 'node',
  },
});
