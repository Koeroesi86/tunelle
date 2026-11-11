# Unit tests

A unit test checks one unit of code, and everything around the unit is a mock. It takes nothing from the system, the platform or the provider it runs on, so it is fast and gives the same result everywhere. `npm run test:backend` and `npm run test:frontend` run them (`npm run test:coverage` with the thresholds).

- **Time:** fake timers (`vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })`, `vi.setSystemTime`), never a real wait. A wait is a `setTimeout` promise, as the fake timers do not cover `timers/promises`.
- **Files:** `vi.mock('fs')` and `vi.mock('fs/promises')`. `electron/test-memory-fs.ts` is an in-memory stand-in for the functions the code uses (`memoryFs.sync`, `memoryFs.promises`, `memoryFs.reset()` in `beforeEach`); add a function to it when a test needs one. No `mkdtemp`, no `os.tmpdir()`.
- **Database:** a mock of the module that reads and writes (`vi.mock('../database/execute-query')`), or of the repository, when the unit is the code around it. No `createTestDatabase()`.
- **Processes and network:** `vi.mock('child_process')` (`spawn` returns a fake child), `vi.stubGlobal('fetch', …)`, no server on a port.
- **Electron and the system:** `vi.mock('electron')`, and `process.platform` through `vi.stubGlobal` or `Object.defineProperty` in the test, with the other platform tested too.

What needs the real thing is not a unit test: SQL against SQLite, a scan of real files, ffmpeg, a hook run by a shell go in `name.integration.test.ts` ([integration-tests.md](integration-tests.md)), which runs in `electron/`, `scripts/` and `.claude/hooks/`. A benchmark that prints a comparison and asserts nothing is `name.timing.test.ts`, run by hand with `npm run test:timing`, and not by `npm test`.

## The guard

`scripts/checks/unit-test-isolation.test.ts` fails on a unit test that uses `createTestDatabase`/`sqlite3`, `mkdtemp`/`os.tmpdir()`, `createServer`, `execSync`, `execFileSync` or `spawnSync`, unless `scripts/checks/unit-test-isolation-baseline.json` lists the file. The baseline is the work that is left: a test that is mocked or moved to the integration tier must be removed from it (the guard fails on a stale line too), and a new test is never added to it.

## Why a unit test was slow

Measured with `npx vitest run --reporter=json`, the whole suite takes about 17 s on 16 threads. The time went to:

- the two `*.timing.test.ts` benchmarks (a scroll of 20 000 tracks in a real SQLite, 4 s together), that ran on every `npm test`;
- `claude-hooks`, which starts a shell for each case, and the screenshot fixtures, which write FLAC files, parse them and start a local server;
- the tests with a real SQLite (every `createTestDatabase()` applies all migrations), real folders and real timers, in the baseline;
- the `findBy`/`waitFor` of React tests, that poll in real time (`client/components/`).
