import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    hookTimeout: 30_000,
    include: ['e2e/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 30_000,
  },
});
