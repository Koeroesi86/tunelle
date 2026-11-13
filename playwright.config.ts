import { defineConfig } from '@playwright/test';

// the tests start the built app (npm run build first), see e2e/support/app.ts; the pictures of the website are taken with the same setup (npm run screenshots)
export default defineConfig({
  // one app at a time: a window per test, and the audio is measured against a clock that a second app would load
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  // a retry would hide the test that fails now and then
  retries: 0,
  // the Intel macOS runner has taken more than a minute to start the app
  timeout: process.env.CI ? 180_000 : 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testDir: 'e2e', testMatch: '*.spec.ts', testIgnore: 'accessibility.spec.ts' },
    // the warnings of axe, on Linux only and beside the end to end tests (docs/development/accessibility.md): npm run test:a11y
    { name: 'a11y', testDir: 'e2e', testMatch: 'accessibility.spec.ts' },
    // measurements, not checks: npm run perf
    // PERF_REPEAT runs each measurement that many times, and the summary takes the median of the runs
    { name: 'perf', testDir: 'e2e/perf', testMatch: '*.perf.ts', timeout: 1_200_000, repeatEach: Number(process.env.PERF_REPEAT ?? 1) },
    // the own updater of macOS replaces a packaged app, so it runs after npm run dist: npm run test:updater
    { name: 'updater', testDir: 'e2e/updater', testMatch: '*.updater.ts', timeout: 900_000 },
    { name: 'screenshots', testDir: 'e2e/screenshots', testMatch: '*.shots.ts' },
  ],
});
