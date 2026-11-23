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
    exclude: [
      'tests/e2e/**',
      // Standalone script run via `npm run test:reminders` (tsx, not
      // vitest) -- it uses its own console-based assertions, not
      // describe/it, so vitest's `src/**/*.test.ts` pattern picking it up
      // fails with "No test suite found in file".
      'src/lib/reminders.test.ts',
    ],
    // `npm run test:coverage` (#835). It needs the v8 provider: `npm i -D @vitest/coverage-v8`.
    // Coverage is measured over the code that unit tests can reach: libraries, hooks, components,
    // i18n and the API routes. Page files are covered by the end-to-end tests instead.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/lib/**', 'src/hooks/**', 'src/components/**', 'src/i18n/**', 'src/app/api/**'],
      exclude: ['**/*.stories.tsx', '**/*.test.{ts,tsx}', 'src/lib/reminders.test.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
