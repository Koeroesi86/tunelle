# Startup and the splash

The app has one window from the first moment. The splash is not a window of its own: it is part of the page of the player window (`index.html`), and the player is mounted under it.

## Order

1. `whenReady` serves the `tunelle://app` protocol and opens the main window (`openWindow` in `index.ts`). It is shown on `ready-to-show`, which does not wait for the library, the update or the database.
2. The page paints the splash at once. `LoadingSplash` is rendered into `index.html` when the site is built, with inline styles and the logo as a data URI (`loading.svg?inline`), so nothing has to be fetched before the first paint, and the script of the app comes after it.
3. The main process reports what it does with `SPLASH_PROGRESS` (text and an optional percent) and asks the metered question with `SPLASH_QUESTION`. `electron/preload.ts` fills the elements of the splash by id (`splash-status`, `splash-progress-track`, `splash-progress-bar`, `splash-actions`), the ids are the contract with `LoadingSplash.tsx`. The answer goes back as `SPLASH_ANSWER` (see [the updater](updater.md)).
4. The update runs, then the library opens (migrations, backfills), the language and theme are applied and the listeners are registered. Then the main process sends `APP_STARTED` (`electron/services/startup-signal.ts`). The page also asks with `STARTUP_STATUS`, which is answered when the app has started already, so a page that loads after the message still starts.
5. On `APP_STARTED` the page mounts the player into `#root`, under the splash. The first page of tracks loads and the splash fades out and is removed (`hideSplash` in `client/startup.ts`).

`#root` stays empty until step 5, so "the page is rendered" (the smoke and end to end tests) still means that the player is mounted.

## Rules that cost time to find

- The page must not talk to the main process before `APP_STARTED`. The listeners and the database are registered just before it, a message sent earlier is lost without an error. The store is created in `mount` (`createAppStore`, `client/redux/store.ts`) and not when the script loads, as the connection middleware sends `APP_READY` and asks for the favourites, history and playlists the moment it is created. When it was created at load, the player stayed empty of folders and saved its default settings over the real ones on the next unload.
- A page that saves its settings (`beforeunload`) before they were restored overwrites them. Nothing reloads the page in the app; the end to end tests do, see [the end to end tests](../development/end-to-end-tests.md).
- `loadURL` of the window rejects when a navigation interrupts it, and the start up chain ends in `process.exit(1)`. Do not reload the page before the splash has gone.

## Notes

- Nothing in the player talks to the main process before step 4: the listeners and the database are not there, which is why the player is not mounted earlier.
- Closing the window while the library opens quits the app, and the database that was opened is closed first.
- The splash has no window buttons: the window can be closed with the keyboard shortcut of the system, as the splash window could.
- The theme and language are applied after the window opened, as they are read from the library. The splash looks the same in both themes.

## Measured

On a Linux machine with no display (`--ozone-platform=headless`), an empty profile and `TUNELLE_NO_UPDATE=1`, the window is shown after about 0.25 s, the player is mounted after 0.6 s (0.9 s with the development server) and the splash is gone after 1.4 s (1.7 s). The CPU of the whole process tree is about 1.6 s for the start with the development server and 0.2 s over the next 10 s idle. A production build uses less than a second. These do not include a large library (migrations and backfills run as before, behind the splash), the GPU, or a webpack compile that is still running when Electron starts (`devServer.config.js` spawns it as soon as the server listens). The method: start the page and read `/proc/<pid>/stat` of the process tree, with a script that waits for `#root` to have children and for `#splash` to be gone; `ps -o cputimes` only has whole seconds.

A slow first `npm run dev` is the compile: `prebuild.js` removes `build/` and the icons are generated, then tsc and webpack run. `build/` is gone after a build that stopped halfway, which makes every window an empty document (see [the end to end tests](../development/end-to-end-tests.md)).
