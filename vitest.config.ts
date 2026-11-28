import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';
import { frontend } from './vitest.frontend';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: `${path.resolve(__dirname, 'shared')}/` },
      { find: /^.+\.scss$/, replacement: path.resolve(__dirname, 'client/test/test-utils-style-stub.ts') },
    ],
  },
  test: {
    fsModuleCachePath: path.resolve(__dirname, '.cache/vitest'),
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.ts', 'shared/**/*.ts', 'client/**/*.{ts,tsx}', 'scripts/**/*.{js,ts}', 'index.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'client/test/**',
        'scripts/tooling/config/**',
        'electron/test-database.ts',
        'electron/schemas/database/**',
        'electron/test-utility-process.ts',
        'electron/test-wav.ts',
        'electron/test-memory-fs.ts',
      ],
      // just below the current coverage, so it can not drop; raise them as tests are added. A folder has its own, as the average would hide its drop
      thresholds: {
        statements: 90,
        branches: 87,
        functions: 89,
        lines: 91,
        'client/audio/**': { statements: 93, branches: 91, functions: 88, lines: 96 },
        'client/redux/**': { statements: 97, branches: 96, functions: 98, lines: 98 },
      },
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
            'index.test.ts',
            'electron/**/*.test.ts',
            'shared/**/*.test.ts',
            'scripts/**/*.test.ts',
            '.claude/hooks/*.test.ts',
            '.github/workflows/*.test.ts',
            'packaging/**/*.test.ts',
          ],
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts', '**/*.timing.test.ts'],
        },
      },
      {
        // real SQLite, real files and the real ffmpeg, with only the electron module replaced (docs/development/integration-tests.md)
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          setupFiles: ['electron/test-utility-process.ts'],
          include: ['electron/**/*.integration.test.ts', 'scripts/**/*.integration.test.ts', '.claude/hooks/*.integration.test.ts'],
          // the caches go below the home folder that a test gives `app.getPath`, not into the one of the machine
          env: { XDG_CACHE_HOME: '' },
          testTimeout: 60_000,
        },
      },
      {
        // benchmarks that print a comparison and assert nothing: by hand with npm run test:timing (docs/development/unit-tests.md)
        extends: true,
        test: { name: 'timing', environment: 'node', include: ['electron/**/*.timing.test.ts', 'client/**/*.timing.test.ts'], testTimeout: 120_000 },
      },
      frontend,
    ],
  },
});
