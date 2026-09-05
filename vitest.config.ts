import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
      'tests/unit/DestructiveActionConfirmation.test.tsx',
      'tests/unit/useKeyboardShortcuts.test.tsx',
      'tests/unit/willExport.test.ts',
      'tests/unit/ErrorBoundary.test.ts',
      'tests/unit/Analytics.test.ts',
      // Standalone script run via `npm run test:reminders` (tsx, not
      // vitest) -- it uses its own console-based assertions, not
      // describe/it, so vitest's `src/**/*.test.ts` pattern picking it up
      // fails with "No test suite found in file".
      'src/lib/reminders.test.ts',
    ],
  },
});
