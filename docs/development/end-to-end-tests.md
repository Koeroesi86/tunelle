# Testing the app

`e2e/` holds the Playwright tests with `_electron`; run `npm run test:e2e` after `npm run build`, as they start the built `out/`.

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
- The window runs with `--disable-audio-output`, and `e2e/support/audio-probe.ts`, added before the page loads, taps what reaches the destination of the audio context, stamped with the audio clock. Assert on pitch, level and silence with `e2e/support/audio.ts` (`expectTone`, `expectSilence`, `levelNow`, `longestGap`), never on a sleep.
- Select by the English text of `shared/locales/en.json` and `navigate()` for the sidebar. Pages stay mounted, so a text can be on a hidden page too: `filter({ visible: true })`. A page that was just left stays visible for 90 ms (`client/styles/tab-motion.scss`), so `filter({ visible: true })` can still match it on a slow system (a Windows run clicked the favourite button of the radio stations instead of the album): scope a click to `[class*="PlayerTabs__active"]`, which changes with the navigation.
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
