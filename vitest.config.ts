import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      // Route modules are integration surface measured by `npm run e2e`. They are also
      // unreadable to the v8 provider under dynamic segments such as `pages/[lang]/`,
      // where the encoded directory name defeats its source lookup.
      exclude: ['**/*.d.ts', 'apps/*/src/pages/**'],
      experimentalAstAwareRemapping: true,
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
