# What is an integration test

Where the line between the test projects is. Part of [Integration tests](integration-tests.md).

## What is an integration test, and what is not (integration-tests.md#388)

Only what a unit test can not show is one ([unit-tests.md](unit-tests.md) says it first: unit test everything with mocks, integration only for what they can not cover, end to end only where neither can). The 66 unit tests that used the real system were each mocked or moved here, and most of the moved ones kept a unit test of the logic next to them (`name.test.ts` and `name.integration.test.ts` for the same module). What stayed here, and why a mock does not show it:

- **`electron/database/`, `electron/repositories/`:** the SQL against SQLite and all the migrations (`createTestDatabase()`); a mocked `execute-query` returns what the test says, whatever the query is. The unit tests of the repositories check which queries and parameters go out.
- **`electron/library/scan/`, `electron/library/watch/`, `mounts/`, `art/`, `loudness/`:** the scan, the queue, the files and the database working together (a rescan of a changed file, a folder that goes offline, the order of the stored rows); `fs.watch` differs by system. The unit tests of `scan-folder`, `rescan-library`, `rescan-changes` and `folder-watcher` check the decisions with the memory file system and the mocked repositories.
- **`electron/protocols/`, `electron/listeners/`, `electron/remote/`, `electron/services/`:** a route over a database that has rows, a listener that keeps its data across a restart, the radio over a real stream, the AppImage launcher entry started by the shell, and the swap script of the macOS update (`mac-update-source.integration.test.ts` runs the real `sh`).
- **`scripts/`:** a script that starts a real process (the command line of `version.js`), builds a real tree (`build-site`, `generate-icons`, `alias-paths`) or reads the whole repository (`unit-test-isolation`).

A test that only needed a folder to write into, a clock, a child process or a port is not here: it is a unit test with `memoryFs`, fake timers, `child_process` mocked and a server that never listens.

The `integration` project loads `electron/test-utility-process.ts` as its setup file, as the `backend` project does: the scan tests start the tag reader in a utility process, and without the fake one the first scan fails with `Cannot read properties of undefined (reading 'fork')` and the run goes on until it is out of memory. Check it with `npx vitest run --project integration electron/library/scan`.

Coverage: `npm run test:coverage` does not run this project, so a line that only an integration test reaches counts as not covered. Counting it was tried (the first version of #388 moved all 66 files here and added `--project integration`) and dropped: the number then says nothing about the unit tests, and a mocked unit test is the one that fails in a few milliseconds.

`sliced-loudness.integration.test.ts` (in `electron/protocols/`) measures a 13 minute WAV in pieces with `measureSliced`, on a real file that a stub of `fetch` serves in ranges, and checks that the level is the one of the whole file. It replaced the end to end test of a 50 minute file, which waited for a hidden window to decode it. The stub is set in the test, not in `beforeAll`: the project restores the globals before each test (**symptom:** every read was `unreadable` and the stub was never called). The software rendering tests and the restart of the library are gone from `e2e/` too: `gpu-acceleration.test.ts`, the reducer and the theme provider cover the first, `collections.spec.ts` restarts the whole app and `library-sync.integration.test.ts` covers the stored library.
