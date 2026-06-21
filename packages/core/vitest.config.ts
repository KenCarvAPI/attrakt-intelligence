import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure scoring maths is unit-tested; it has no database dependency.
    include: ['src/**/*.test.ts'],
    // These use the node:test runner (pnpm test:integration), not vitest.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/merge-member.test.ts',
      '**/tenant-isolation.test.ts',
    ],
    environment: 'node',
  },
});
