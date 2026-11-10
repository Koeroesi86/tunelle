# Testing the app

`e2e/` holds the Playwright tests with `_electron`; run `npm run test:e2e` after `npm run build`, as they start the built `out/`.

- `e2e/support/app.ts` starts `out/` on a clean profile (a second `start()` in a test is a restart on the same profile) with the fake station directory and the generated library of `e2e/support/library.ts`, whose tracks are sines of known pitch (`writeFlac({ frequency })`).
- The window runs with `--disable-audio-output`, and `e2e/support/audio-probe.ts`, added before the page loads, taps what reaches the destination of the audio context, stamped with the audio clock. Assert on pitch, level and silence with `e2e/support/audio.ts` (`expectTone`, `expectSilence`, `levelNow`, `longestGap`), never on a sleep.
- `npm run test:e2e` runs `scripts/checks/run-e2e.js`, which runs two phases: the tests tagged `{ tag: '@parallel' }` with 3 workers, then the rest with one. The audio is measured against a clock that a second running app would load, so a test that asserts on the sound (`expectTone`, `steadyLevel`, `levelNow`) or on timing stays untagged and runs alone; a test that does not (the library, playlists, the window, the settings) gets the tag. Each test has its own profile in a temporary folder, so tagged tests do not share state. In CI each phase writes a blob report (`blob-report/`) and the script merges both into the one HTML report in `playwright-report/`; the traces of a failed test are in `test-results/parallel` or `test-results/serial`.
- Select by the English text of `shared/locales/en.json` and `navigate()` for the sidebar. Pages stay mounted, so a text can be on a hidden page too: `filter({ visible: true })`.
- Anything that differs by system (macOS keeps the app open without a window) is branched on `process.platform` in the test, with the reason.
- The environment variables of the app that the tests set are in [building.md](building.md).
