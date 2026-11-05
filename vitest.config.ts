import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: `${path.resolve(__dirname, 'shared')}/` },
      { find: /^.+\.scss$/, replacement: path.resolve(__dirname, 'client/test/test-utils-style-stub.ts') },
    ],
  },
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.ts', 'shared/**/*.ts', 'client/**/*.{ts,tsx}', 'scripts/**/*.{js,ts}', 'index.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'client/test/**', 'scripts/tooling/config/**', 'electron/test-database.ts', 'electron/test-utility-process.ts'],
      // just below the current coverage, so it can not drop; raise them as tests are added
      thresholds: { statements: 77, branches: 81, functions: 75, lines: 79 },
      reporter: ['text-summary', 'json-summary', 'lcov'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          setupFiles: ['electron/test-utility-process.ts'],
          include: [
            'electron/**/*.test.ts',
            'shared/**/*.test.ts',
            'scripts/**/*.test.ts',
            '.claude/hooks/*.test.ts',
            '.github/workflows/*.test.ts',
            'packaging/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          setupFiles: ['client/test/test-setup-frontend.ts'],
          include: ['client/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
