# The updater

electron-updater only works in the packaged app, and on Linux only in an AppImage:

- the Flatpak updates through its store;
- any other package updates through its package manager;
- the Microsoft Store package updates through the Store;
- an AppImage that AM manages updates through AM (`am -u tunelle`);
- an AppImage that cannot be replaced (a folder that is not writable) is not updated at all, and the settings say so.

`TUNELLE_NO_UPDATE=1` turns it off, which the smoke tests of the packaged app set. `MOCK_UPDATE=1 npm run dev` shows a mocked update on the splash (nothing is installed). The reason an update is unavailable comes from `getUpdateUnavailableReason` in `electron/services/updater.ts`.

The published release is what installed apps update from, see [releases.md](releases.md).
