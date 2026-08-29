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
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'tests/e2e/**',
      'src/lib/reminders.test.ts',
      'tests/unit/DestructiveActionConfirmation.test.tsx',
      'tests/unit/useKeyboardShortcuts.test.tsx',
      'tests/unit/willExport.test.ts',
      'tests/unit/ErrorBoundary.test.ts',
      'tests/unit/Analytics.test.ts',
    ],
  },
});
