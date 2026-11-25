import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      viem: path.resolve(__dirname, 'tests/mocks/viem.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    css: false,
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    // Only Playwright specs are excluded: they need a running browser and are
    // executed by `npm run test:e2e` / `npm run test:a11y`, not by vitest.
    exclude: ['tests/e2e/**'],
    // `npm run test:coverage` (#835). It needs the v8 provider: `npm i -D @vitest/coverage-v8`.
    // Coverage is measured over the code that unit tests can reach: libraries, hooks, components,
    // i18n and the API routes. Page files are covered by the end-to-end tests instead.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/lib/**', 'src/hooks/**', 'src/components/**', 'src/i18n/**', 'src/app/api/**'],
      exclude: ['**/*.stories.tsx', '**/*.test.{ts,tsx}'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
