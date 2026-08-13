import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/*.d.ts'],
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['json-summary', 'lcov'],
      reportsDirectory: './coverage',
    },
    exclude: [...configDefaults.exclude, 'e2e/**', 'evals/**'],
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
});
