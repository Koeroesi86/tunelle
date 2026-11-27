# Testing the app

`e2e/` holds the Playwright tests with `_electron`; run `npm run test:e2e` after `npm run build`, as they start the built `out/`. An end to end test is the last tier: unit test everything first ([unit-tests.md](unit-tests.md)), then what a unit test can not cover is an integration test ([integration-tests.md](integration-tests.md)), and only what neither can show (sound, the window, Chromium, the operating system) is written here. Variants of one thing (the formats of a decoder, the values of a setting) are tried at the lower tier, and one of them is played here to show that the path works end to end: a format is a row in `electron/protocols/decoded-track.integration.test.ts`, not a new spec in `e2e/functional/`.

## Layout

One folder per Playwright project (`playwright.config.ts`), and every test file in it is `name.spec.ts`; the folder, not a suffix or an ignore list, decides which project runs it. Vitest keeps `name.test.ts`, so a file name also says which runner owns it, and neither runner picks up the other's files.

| Folder | Project | Run by |
| --- | --- | --- |
| `e2e/functional/` | `e2e` | `npm run test:e2e` (CI, every system) |
| `e2e/accessibility/` | `a11y` | `npm run test:a11y` |
| `e2e/perf/` | `perf` | `npm run perf` |
| `e2e/updater/` | `updater` | `npm run test:updater` |
| `e2e/screenshots/` | `screenshots` | `npm run screenshots` |

`e2e/support/` (shared helpers, not tests) and `e2e/fixtures/` are used by all of them. A new test goes in the folder of its project, and a new kind of check is a new folder with its own project.

- `e2e/support/app.ts` starts `out/` on a clean profile (a second `start()` in a test is a restart on the same profile) with the fake station directory and the generated library of `e2e/support/library.ts`, whose tracks are sines of known pitch (`writeFlac({ frequency })`).
- The window runs with `--disable-audio-output`, and `e2e/support/audio-probe.ts`, added before the page loads, taps what reaches the destination of the audio context, stamped with the audio clock. Assert on pitch, level and silence with `e2e/support/audio.ts` (`expectTone`, `expectSilence`, `levelNow`, `longestGap`), never on a sleep. The numbers are of the left channel; `expectToneOnRight` listens to the right one.
- The probe is a `ScriptProcessorNode` and not an AudioWorklet: the page has a content security policy (`script-src 'self'`, see [electron-security.md](electron-security.md)) that refuses a worklet module from a `blob:` address. **Symptom:** every playback test heard silence (`Expected: 440, Received: 0`). **Check:** `npx playwright test e2e/functional/playback.spec.ts` after `npm run build`; do not add `blob:` to the policy for the test.
- Select by the English text of `shared/locales/en.json` and `navigate()` for the sidebar. Pages stay mounted, so a text can be on a hidden page too: `filter({ visible: true })`. A page that was just left stays visible for 90 ms (`client/styles/tab-motion.scss`), so `filter({ visible: true })` can still match it on a slow system (a Windows run clicked the favourite button of the radio stations instead of the album): scope a click to `[class*="PlayerTabs__active"]`, which changes with the navigation.
- A test that needs two apps takes the `second` fixture next to `session`: a second app on an empty profile of its own, closed and removed after the test. The remote listening test uses it ([remote-listening-test-plan.md](remote-listening-test-plan.md)).
- A folder that the app reads is removed only after the app has quit: Playwright tears fixtures down in the reverse of their setup, so `session` names `music` before `start`. **Symptom:** `EPERM, Permission denied` on `rmSync` of the music folder, on Windows only, as the app or its ffmpeg still held a track open ([decoder-proxy.md](../app/decoder-proxy.md)). A test that takes `music` without `session` names it before `start` too, and a test that takes `session` and `start` (a restart) names `session` first: with `{ start, session }`, `start` is set up before `music`, so the folder went while the restarted app still ran (`collections.spec.ts`). The order is the same on every system, so it can be checked on Linux: log in the teardown of both fixtures and run the spec.
- Anything that differs by system (macOS keeps the app open without a window) is branched on `process.platform` in the test, with the reason.
- The environment variables of the app that the tests set are in [building.md](building.md).

## The window opens before the test can add its scripts

The window opens as soon as the app is ready, before the library is open, so `launchApp` (`e2e/support/app.ts`) adds the init scripts (`window.activeAudio`, `window.audioProbe`) to a page that has loaded already. The player creates its audio context when it is mounted, so the scripts have to run on a load that starts after they were added. What the helper does, and why:

- It adds the scripts to the context and to the page (`page.addInitScript`). The context alone missed the early window on some starts, and a reload then did not bring them.
- It waits until the splash is gone (`#splash` removed, which is after the settings were restored and the first page of tracks is in), then reloads until the scripts are there. A page that is loaded again earlier saves its settings on the way out, and a default state written then overwrites the saved ones ("keeps the mode after a restart" failed on that).
- `#root` stays empty until the app has started (see [startup](../app/startup.md)), so waiting for its children still means that the player is mounted.

## When every test times out at once

- Check that `build/` exists: the page is served from it, and without it the window shows an empty document (`#root` and `#splash` both missing, one 404 in the console). `npm run build` brings it back.
- A launch from a script needs `ELECTRON_RUN_AS_NODE` left out of the environment (`electron.launch` fails with "bad option: --remote-debugging-port=0").
- To see what the main process receives, append to a file from the handler (`fs.appendFileSync`): the output of the app is not forwarded by `electron.launch`. Take it out again.

## A count of what happened first, read after the fact

- **Symptom:** `loudness.spec.ts` "measures a track that is queued before the ones that come first in the library" failed on macOS with `Expected: <= 3, Received: 4`, and passed on Linux and Windows.
- **Cause:** the test counted the other tracks that had a gain when the poll saw the queued one. The default poll waits up to a second between reads and a measurement with its cool-down takes about as long, so a slow poll saw the count of a later moment. The count also took in tracks that were measured before the message was sent.
- **Fix:** count only what was measured since the message, poll every 50 ms and read the queued track before the others, so the count is the one of the moment it was measured. Without the queue the count is the number of the other tracks (6 of 7 in a check by hand), with it 2 at most.
- **Now:** the test is gone from `e2e/`, as the order of the queue is tried against the real queue tasks in `electron/library/loudness/loudness-source.test.ts` ("are put on the queue as tasks of their own, in the order given"), where nothing is timed.
- **Rule:** when a test asserts on an order or a count of things that happen over time, read the state at the moment the first one is seen, not at the time of a slow poll.
