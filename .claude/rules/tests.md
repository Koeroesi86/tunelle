---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "e2e/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Tests

- Testing the app (`e2e/`, Playwright with `_electron`, `npm run test:e2e` after `npm run build`): assert on the audio the app sends out with `e2e/support/audio.ts`, never on a sleep, select by the English text of `shared/locales/en.json`, and branch on `process.platform` in the test, with the reason, for what differs by system. Read [docs/development/end-to-end-tests.md](docs/development/end-to-end-tests.md) before writing one.
- Test pyramid: unit test everything (with mocks); only what a unit test can not cover gets an integration test; only what neither can cover gets an end to end test. Many variants of one path (codecs, formats, option values) are rows of one integration or unit test, and only one variant gets an end to end test; before adding a spec to `e2e/`, check that a lower tier can not show it, and move an end to end test down when it can. Each e2e spec and integration test file has the line `// Needs the real <app or thing>: <what the tier below can not show>` (`scripts/checks/test-tier-reason.ts` and a hook fail without it), and a test added to a file must be covered by its reason. A test next to the code (`name.test.ts`) that fails without the change; no fixed sleeps. A unit test checks one unit against mocks: fake timers, `vi.mock('fs')` (`electron/test-memory-fs.ts`), a mocked database, `child_process` and `fetch`, and nothing of the system, platform or provider it runs on; it is never conditional (no `skipIf`, `runIf` or `skip`: it builds paths with `path.join`, sets the platform itself and runs everywhere); what needs the real thing is `name.integration.test.ts`, and a benchmark is `name.timing.test.ts` (`npm run test:timing`, by hand). `scripts/checks/unit-test-isolation.integration.test.ts` fails on a unit test with a real database, folder, server or process (there is no list of exceptions). Read [docs/development/unit-tests.md](docs/development/unit-tests.md) before writing one.
