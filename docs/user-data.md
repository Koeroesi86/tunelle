# The app data folder

The app name (`getAppName` in `electron/utils/userData.ts`) is `Tunelle`, `Tunelle-dev` for a development run. The folder of Electron's own data follows it, and the library lives there. `TUNELLE_APP_DATA=<folder>` replaces it, see [building.md](building.md).

## Copy from the folder before the rename

The library folder (the library, its backups, the covers) of the folder the app used before it was renamed is copied once. It is done when the library is there, not when the folder is: on macOS and Windows `tunelle` and `Tunelle` are one folder, which Electron's data has created by then.

The old folder stays where it is, and a copy that fails is ignored: the app starts as on a first run. What a running app holds open or can rebuild (the singleton locks, the caches) is not copied, as a copy of a lock would make the copy of the app look like a second instance.
