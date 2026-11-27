# Opening audio files with the app

Tunelle is offered for audio files by the system (the "Open with" menu, the default applications of Fedora and other desktops, the file types of Windows and macOS) and plays the file it is given.

## What declares the types

- Linux: the `MimeType` key of the desktop entries, in `packaging/flatpak/` (the Flatpak, `Exec=Tunelle %U`), `packaging/appimage/` (the entry inside the AppImage) and `buildDesktopEntry` of `electron/services/platform/app-image-launcher.ts` (the launcher entry). The list is `electron/constants/audio-mime-types.ts`; a test (`packaging/flatpak/flatpak-metadata.test.ts`) keeps the files and the list the same. Without `MimeType`, the settings of the default applications do not list the app for music at all, which was the report that led to this.
- Windows (the installer and the Store package) and macOS: `build.fileAssociations` of `package.json`, with the extensions of `supportedFormats` (`electron/utils/is-supported.ts`); the same test checks them. electron-builder writes them into the installer, the appx manifest and `Info.plist`.

## What happens at the start

`electron/library/opened/opened-files.ts` takes the audio files among the arguments of a start (a path, or the `file:` address that `%U` passes), from three places: `process.argv` of the first start, the `second-instance` event (the running window comes forward, as before) and the `open-file` event of macOS, which also comes before the app is ready.

The tags are read with the track reader of the library scan, and a file with a codec that does not play is left out. The tracks are sent to the page as `OPENED_FILES` when it is ready (`APP_READY`), and kept until then; the page plays them (`PLAY_TRACKS`).

At `APP_READY` they are sent after the saved settings (`register-state-listeners.ts`). **Symptom:** a file opened while the app was closed did not play, the track of the last time did. **Cause:** the files were read before the page was ready and were sent before the settings, so the restored queue replaced them. **Check:** `npx playwright test --project=e2e open-files` after `npm run build`.

A file that is not in a library folder is not stored in the library: the `/track` route serves it from the list of opened files (`findOpenedTrack` in `serveTrack`) and still serves nothing else. The list lasts until the app quits. Such a track has no measured loudness, only the tags.

## Check it

`xdg-mime query default audio/flac` after installing the Flatpak names the app once it is chosen in the settings; `gio mime audio/flac` lists it among the registered ones. `flatpak run io.github.koeroesi86.Tunelle ~/Music/a.flac` starts it playing; the same command with the app running plays in the running window.
