import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure scoring maths is unit-tested; it has no database dependency.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
