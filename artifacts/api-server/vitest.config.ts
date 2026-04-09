import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Only measure coverage for the core modules we actually test
      include: [
        'src/lib/schemas.ts',
        'src/lib/session-blacklist.ts',
        'src/lib/totp.ts',
        'src/middleware/auth.ts',
        'src/app.ts',
        'src/routes/health.ts',
      ],
      exclude: ['node_modules', 'dist', 'src/__tests__'],
      thresholds: {
        lines: 50,
        functions: 55,
        branches: 30,
        statements: 50,
      },
    },
    testTimeout: 15000,
  },
});
