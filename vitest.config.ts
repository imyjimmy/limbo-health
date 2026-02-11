// vitest.config.ts (monorepo root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    setupFiles: ['./tests/setup/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
  },
});