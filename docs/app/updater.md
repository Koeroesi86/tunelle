# The updater

electron-updater only works in the packaged app, and on Linux only in an AppImage; macOS has its own updater (below):

- the Flatpak updates through its store;
- any other package updates through its package manager;
- the Microsoft Store package updates through the Store;
- an AppImage that AM manages updates through AM (`am -u tunelle`);
- an AppImage that cannot be replaced (a folder that is not writable) is not updated at all, and the settings say so.

`TUNELLE_NO_UPDATE=1` turns it off, which the smoke tests of the packaged app set. `MOCK_UPDATE=1 npm run dev` shows a mocked update on the splash (nothing is installed). The reason an update is unavailable comes from `getUpdateUnavailableReason` in `electron/services/updater.ts`.

The published release is what installed apps update from, see [releases.md](../release/releases.md).

## Metered connections

The version check is small and always runs; the download asks first when the system says the connection is metered, as it uses data the user may pay for. `isMeteredConnection` in `electron/services/metered-connection.ts` asks the system, with a timeout of 3 seconds, and any error, a timeout or an answer it does not know counts as not metered, so the detection never blocks the app:

- **Windows**: `NetworkCostType` of the connection profile through a short `powershell.exe` call; `Fixed` and `Variable` are metered, `Unrestricted`, `Unknown` and `Default` are not.
- **Linux**: the `Metered` property of NetworkManager through `busctl`; 1 (yes) and 3 (guess yes) are metered, 0, 2 and 4 are not. No `busctl` or no NetworkManager is not metered.
- **macOS**: not detected, as `isExpensive` of Network.framework needs a native helper. It counts as not metered.
- `navigator.connection` is not used, it does not read the setting of the system on a desktop.
- `TUNELLE_METERED=1` makes every platform metered, for a hotspot the system does not know and for testing.

**On the splash** (`confirmDownload` of `runUpdate`) the splash shows "Download" and "Not now" (`askOnSplash` in `electron/services/splash-confirm.ts`). "Download" goes on as without the question; "Not now", and closing the splash, start the installed version for this start only. The next start asks again.

**In the settings** the manager sets the status `metered` before it checks, and the page asks to continue (`CONFIRM_METERED_UPDATE`) or not (`CANCEL_METERED_UPDATE`, back to idle). A check later asks again.

The setting "Download on a metered connection" (`allowMetered` in `update-preference.json`, next to `automatic`) skips both questions. It is off by default.

## macOS

electron-updater installs an update through Squirrel.Mac, which refuses an app without a Developer ID, and the macOS build is signed ad hoc (`identity: "-"`; there is no Apple Developer membership, see [#314](https://github.com/Koeroesi86/tunelle/issues/314)). So the app updates itself with `electron/services/mac-update-source.ts`, which implements the same `UpdateSource` as electron-updater, and the splash and the settings use it the same way.

1. **Check**: `latest-mac.yml` and `latest-mac.yml.sig` come from the latest release (`TUNELLE_UPDATE_URL` replaces the address). The signature has to be an ed25519 signature of the whole file by a key of `shared/constants/update-keys.ts`; the file names the version and the sha512 of each zip, so one signature covers them. The version has to be greater than the installed one, and the zip is the one of the running architecture (`arm64` in its name, or not).
2. **Download**: the zip goes to the temporary folder with `pipeline` and must match the sha512. It is unpacked with `ditto` next to the installed app (`.Tunelle-update`, the same volume), and `codesign --verify`, the version of its `Info.plist` and the architecture of its executable are checked before anything is installed.
3. **Install**: a detached `sh` script waits for the app to quit, renames the installed app to `Tunelle.app.backup` and the new one in its place, and opens it (`open --env` hands the `TUNELLE_` variables on). The new app writes `update-started` in the app data folder once its library is open. The script drops the backup then; when the marker does not come in two minutes (the first start of a new bundle is slow while macOS checks it), or the rename fails, it puts the backup back, opens the old app and writes the version to `update-failed`. The script keeps its steps in `update-failed.log` next to it.
4. **Failed version**: a version in `update-failed` is not tried again, the check fails with a message (shown in the settings) until a greater version is released.

The update is not offered where it cannot work (`translocated`: the app runs from a disk image or from the randomised copy macOS makes of an app that was never moved, `macReadonly`: the folder of the app is not writable), and the settings say so.

The private key is the secret `UPDATE_SIGNING_KEY` (PEM) of the environment `release`; `release.yml` signs `latest-mac.yml` with `scripts/release/update-signature.js` after the architectures are merged. `node scripts/release/update-signature.js generate` makes a pair; the public key (base64) goes into `update-keys.ts`. A second key is added before the first is retired, as an app only trusts the keys it shipped with, and an app that knows none of the keys of a release has to be installed again by hand. A release made without the secret is published without a signature (a warning in the log), and macOS apps do not update.

An ad hoc signature has no stable identity, so macOS may ask again for access to protected folders after an update ([Apple Developer Forums](https://developer.apple.com/forums/thread/795739)). A library folder that is not readable then is offline, and its tracks stay in the library ([mount-guard.md](mount-guard.md)).

`npm run test:updater` (after `npm run dist`, macOS only) runs `e2e/updater/updater.updater.ts` on the packaged app: a signed update is installed and started; an update that installs and does not start is rolled back; a changed zip, a signature of another key, a folder that is not writable and a translocated path leave the app untouched. `dist.yml` runs it on both macOS runners.
