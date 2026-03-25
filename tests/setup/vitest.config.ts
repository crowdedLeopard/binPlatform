import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/tests/**',
        '**/fixtures/**',
        '**/.squad/**',
        '**/scripts/**',
        '**/infra/**',
        '**/deploy/**',
        '**/*.config.ts',
        '**/*.config.js',
        '**/migrations/**',
      ],
      // Coverage thresholds per Bobbie's charter
      thresholds: {
        // Global thresholds
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      // Per-directory thresholds
      perFile: true,
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@tests': path.resolve(__dirname, '..'),
    },
  },
});
