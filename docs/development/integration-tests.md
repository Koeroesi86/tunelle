# Integration tests

`electron/**/*.integration.test.ts` is the Vitest project `integration` (`npm run test:integration`). It sits between the unit tests and `e2e/`: the code of the main process runs against the real things around it, in Node and without Electron.

- **Real:** SQLite (`createTestDatabase()`, all migrations applied), the files of `e2e/fixtures/`, `music-metadata`, and the ffmpeg of this system (`.cache/ffmpeg/install/bin`, `npm run ffmpeg` builds it, CI downloads it).
- **Replaced:** only the `electron` module, with `vi.mock('electron')`: where the app is (`app.getAppPath()`), where it writes (`app.getPath()`), and a utility process that answers with the code of the worker in the same process.
- **Not in the unit tests:** they mock the metadata, the database or the decoder, so a change that breaks only the cooperation of two parts passes them.

`decoded-track.integration.test.ts` scans a fixture folder of each format that Chromium does not play, then decodes the tracks the library holds and checks the pitch, the length and the sample width of the WAV.

`decoded-loudness.integration.test.ts` measures the decoded WAV of each format with `measureBlocks` and `summarise` of `client/loudness/`, the code the hidden window runs, and compares the level with an ideal sine of the pitch and amplitude the fixture was made with (0.125, DSD 0.5). The ideal sine of half the full scale is checked against -9.7 LUFS, the figure that `e2e/loudness.spec.ts` expects from Chromium, so the two environments are tied by one number. Chromium's resampler in `decodeAudioData` is replaced by a cubic one in `electron/test-wav.ts`; what only Chromium can show (24 bit at 88.2 kHz) stays in `e2e/dsd.spec.ts`.

## What stays in `e2e/`

Whatever needs Chromium or the operating system around the app: sound leaving the app, the loudness measurement (it runs in a hidden window, see [loudness-measurement.md](../app/loudness-measurement.md)), the window, the `tunelle://` scheme as Electron registers it, and the preload. A test here cannot see a difference between Node and Electron (`net.fetch`, streams, `app.isPackaged`), so a behaviour that depends on one is an end to end test.

## In CI

A step of the `test` job of `test.yml` after `npm run test:coverage` and before the build, on every system. `required-checks` of `pr-checks.yml` needs `test`, so the step is a required check without a rule of its own. `npm run test:coverage` runs the projects `backend` and `frontend` only; `npm test` runs all three.

A new test file is named `name.integration.test.ts` and goes next to the code it tests. Read the sine fixtures in [e2e/fixtures/README.md](../../e2e/fixtures/README.md) before adding a format.
