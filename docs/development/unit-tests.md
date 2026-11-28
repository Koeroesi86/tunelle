# Unit tests

**Unit test everything, with mocks. Only what a unit test can not cover gets an integration test ([integration-tests.md](integration-tests.md)), and only what neither of them can cover gets an end to end test ([end-to-end-tests.md](end-to-end-tests.md)).** Before a test is written as an integration test, say what the unit test can not show (the SQL of a query, a file that the system watches, a process that really starts); a mock that is hard to write is not a reason.

A unit test checks one unit of code, and everything around the unit is a mock. It takes nothing from the system, the platform or the provider it runs on, so it is fast and gives the same result everywhere. `npm run test:backend` and `npm run test:frontend` run them (`npm run test:coverage` with the thresholds). The coverage counts the unit tests only: a line that only an integration test reaches is not covered. `vitest.config.ts` has a threshold for everything and one of its own for `client/audio/` and for `client/redux/`, as the average would hide a drop there. A benchmark that prints a comparison and asserts nothing is `name.timing.test.ts`, run by hand with `npm run test:timing`, and not by `npm test`.

- **Time:** fake timers (`vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })`, `vi.setSystemTime`), never a real wait. A wait is a `setTimeout` promise, as the fake timers do not cover `timers/promises`. A `setInterval` of 0 ms loops for ever under fake timers: spy on `globalThis.setInterval` and `clearInterval`, keep the callbacks and call them by hand.
- **Files:** `vi.mock('fs')` and `vi.mock('fs/promises')` with `electron/test-memory-fs.ts`, an in-memory stand-in (`memoryFs.sync`, `memoryFs.promises`, `memoryFs.reset()` in `beforeEach`). It has the functions the code uses: `existsSync`, `mkdirSync`, `writeFileSync` (with the `wx` flag), `appendFileSync`, `readFileSync`, `rmSync`, `readdirSync` (also `withFileTypes`), `statSync`, `copyFileSync`, and in `promises` also `stat`, `utimes`, `rename`, `open`, `access`, `symlink`, `readlink` and `rmdir`; a link is followed once. Add a function to it when a test needs one. No `mkdtemp`, no `os.tmpdir()`. Import `memoryFs` before the module under test, or the factory of `vi.mock` reaches it before it exists (`Cannot access '__vi_import_…__' before initialization`).
- **Database:** a mock of the module that reads and writes (`vi.mock('../database/execute-query')`), or of the repository, when the unit is the code around it. A handle that nothing reads is `fakeDatabase()` from `electron/test-fake-database.ts`; do not write `import type { Database } from 'sqlite3'` for it (the guard finds the text). No `createTestDatabase()`.
- **Processes and network:** `vi.mock('child_process')` (`spawn` returns a fake child with `stderr` and `kill`), `vi.stubGlobal('fetch', …)` with a new `Response` for each call (`mockResolvedValue(new Response())` hands out one body that can be read once), `vi.mock('http')` or a spy on `net` for a server that never listens, `vi.stubGlobal('WebSocket', …)`.
- **Electron and the system:** `vi.mock('electron')`, and `process.platform` and `process.arch` through `Object.defineProperty` in the test (and back in `afterEach`), with the other platform tested too.
- **Stateless:** a test leaves nothing for the next and needs nothing from the one before, in any order. A module that keeps state (a signal, a list, a cache) is loaded new in `beforeEach` (`vi.resetModules()` and a dynamic `import()`), a `vi.fn(implementation)` is reset there with `mockReset()` (`restoreMocks` does not reset it), and a global, an environment variable or the platform is set through `vi.stubGlobal` and `vi.stubEnv`. Check it with `npx vitest run --project backend --project frontend --sequence.shuffle.tests --sequence.shuffle.files --sequence.seed=<n>` for a few seeds: a test that fails in one order only shares state.
- **Never conditional:** a unit test runs on every platform and every machine, so it has no `skipIf`, `runIf`, `skip` or early `return` on `process.platform`, the user or a tool that may be missing. A path is built with `path.join` or `path.resolve` as the code builds it (not written as `'/music/a.flac'`), a platform is set with `vi.stubGlobal` or `Object.defineProperty`, and a test of code for one system sets that system itself. A test that can only run on some systems, for the real shell, the real permissions or a tool that is installed, is an integration test (`skipIf` is allowed there, with the reason in the line above).
- **Streams:** a `PassThrough` is changed with `Object.assign(stream, { … })`, as a spread loses its prototype, and `resume` of a stream is not replaced.

## Scripts

A CommonJS script (`scripts/**/*.js` with `require('fs')`) takes the functions of `fs` when it loads, and `vi.mock('fs')` does not reach a `require`. The test spies on `fs`, then loads the script again:

```ts
import fs from 'fs';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';

beforeEach(async () => {
  memoryFs.reset();
  spyOnFs(fs); // vi.spyOn on every function of memoryFs.sync that fs has
  vi.resetModules();
  ({ run } = await import('./store-submission'));
});
```

A script that has no function to call and runs when it loads (`check-dist.js`, `smoke.js`, `generate-dsd-fixtures.ts`, `index.ts`) is tested the same way: the test sets the system up (files, the answer of `spawn`, `process.argv`, `process.platform`), loads it with `vi.resetModules()` and `await import()`, and checks what it printed and how it exited. `process.exit` is replaced by a function that throws, so the script stops where it would have stopped, and the test catches that.

Three things that cost time in `scripts/release/check-dist.test.ts` and `scripts/checks/smoke.test.ts`:

- A spy on `fs.readFileSync` hides the files from the loader of `require`: `Cannot find module` or `ENOENT` of a sibling script. `require` what the script needs (`createRequire(__filename)`) before the spies are set.
- The exports of some packages (`@electron/asar`) can not be spied on (`Cannot redefine property`). Put a fake into `require.cache[require.resolve(name)]` and take it out in `afterEach`.
- `vi.mock` has no effect on a `require` either, so what a script takes from `child_process`, `net` or `http` is spied on (`vi.spyOn(childProcess, 'spawnSync')`), also before it loads.

`index.ts` of the repository root is tested by `index.test.ts` next to it, which the `backend` project includes by name. It mocks the thirty modules the start of the app uses, so it checks the order and the conditions of the start, not what each part does.

## Mocks that keep their state

- `restoreMocks` does not undo `mockResolvedValue` or `mockReturnValue` of a mock made with `vi.fn(implementation)`: the next test gets it too. A mock that a test sets goes back to its default in `beforeEach`.
- `vi.resetModules()` loads the module under test again and keeps the mock registry, so a mock that the test imported before is the one the module uses.
- A test that runs the start of the app or a script leaves nothing running: a promise chain that is not awaited holds the next test back or fails it. Wait for the last call (`vi.waitFor`) before the test ends.

## The guard

`scripts/checks/unit-test-isolation.integration.test.ts` fails on a unit test that uses `createTestDatabase`, `sqlite3`, `mkdtemp`/`os.tmpdir()`, `createServer`, `execSync`, `execFileSync` or `spawnSync`, unless the test mocks the module that has it (`vi.mock('http')`, `vi.spyOn(net, …)`, `vi.mock('child_process')`, `vi.spyOn(fs, …)`). It matches the text, so `import type { Database } from 'sqlite3'` is found too: use `fakeDatabase()` or mock the module. There is no list of exceptions: the baseline of the files that were not isolated yet is gone (#388), and a file that needs the real thing is `name.integration.test.ts`. The guard is an integration test as it reads the tree of the repository; `npm run test:integration` and `verify.ts` run it.

## The reason line

The tier is chosen before the test is written, and an issue that asks for an end to end test does not waive this: write the test at the lowest tier that can show the behaviour and say so on the issue or in the pull request. Every file of the two upper tiers states what the tier below can not show, on a line of its own that starts the comment, normally the first line of the file:

| File | Line |
| --- | --- |
| `e2e/**/*.spec.ts` | `// Needs the real app: Chromium raises the media error` |
| `*.integration.test.ts(x)` | `// Needs the real database: the order SQLite gives` (name the real thing: `files`, `ffmpeg`, `shell`, …) |

`scripts/checks/test-tier-reason.ts` finds a file without it: `test-tier-reason.integration.test.ts` fails on one in the repository, and the hook `guard-test-tier.sh` ([claude-usage.md](claude-usage.md)) blocks Claude from writing a new file without it or editing the line away. The hook does not see a file made by a shell command; the check does. Neither judges whether the reason is true, which is for the review: if the sentence can not be written honestly, the test belongs one tier down. A test added to a file that has the line must be covered by that reason too.

## Why a unit test was slow

Measured with `npx vitest run --reporter=json`, the whole suite takes about 17 s on 16 threads. The time went to:

- the two `*.timing.test.ts` benchmarks (a scroll of 20 000 tracks in a real SQLite, 4 s together), that ran on every `npm test`;
- `claude-hooks`, which starts a shell for each case, and the screenshot fixtures, which write FLAC files, parse them and start a local server;
- the tests with a real SQLite (every `createTestDatabase()` applies all migrations), real folders and real timers, which are now integration tests;
- the `findBy`/`waitFor` of React tests, that poll in real time (`client/components/`).

### `toEqual` of a large buffer

Symptom (`master`, 25 November, `Test (macos-15-intel)`): two tests of `electron/protocols/windowed-track.test.ts` ended with `Test timed out in 5000ms` (5.2 s and 5.7 s), while the other systems passed. Cause: `toEqual` compares a `Buffer` element by element, and these tests compare up to 200 KB. In earlier runs that passed, the same tests already took 1.2 to 4.1 s on that runner. Compare large buffers with `expect(actual.equals(expected)).toBe(true)`; `toEqual` of a few KB is fine and prints a better difference. How to check: a test of two equal buffers of 200 KB took 376 ms with `toEqual` and under 1 ms with `equals` on a developer machine.

## What the move found (#388)

Of the 66 tests that the guard listed, 4 were mocked and stay where they were (`read-track-file`, `missing-tracks`, `radio-browser`, `register-loudness-listeners`), 9 only had the text `sqlite3` as a type and use `fakeDatabase()`, and the rest were split: the logic is a unit test with the memory file system, the repositories or the module that reads and writes mocked, and what needs SQLite or real files went to [integration-tests.md](integration-tests.md). Unit tests only, `npm run test:coverage` is at 87 % of the lines and 85 % of the branches, with the entry points (`index.ts`, `scripts/checks/smoke.js`, the screenshot fixtures) included; the thresholds in `vitest.config.ts` are just below that.
