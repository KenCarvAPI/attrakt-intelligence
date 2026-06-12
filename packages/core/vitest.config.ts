import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share a single Postgres database; run serially.
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
