import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    hookTimeout: 120_000,
    include: ['evals/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 120_000,
  },
});
