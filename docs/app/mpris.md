# Media controls on Linux (MPRIS)

On Linux the player shows in the media controls of the desktop (the GNOME popup and lock screen, KDE widgets, `playerctl`) and answers the media keys through an MPRIS service of its own, not through `navigator.mediaSession`. Windows and macOS keep `navigator.mediaSession` (`client/hooks/use-media-session.ts`).

## Why its own service

Chromium registers `org.mpris.MediaPlayer2.chromium.instance<pid>` and never sets `DesktopEntry`, so GNOME shows a generic icon, and the name cannot be changed (no switch, and it ignores the Flatpak id). A Flatpak may own `org.mpris.MediaPlayer2.$FLATPAK_ID` and nothing more, which is what Flathub asks for instead of `org.mpris.MediaPlayer2.chromium.*`. See the spike in #258 and the Flathub review in #16.

## How it works

- `electron/services/mpris.ts`: the root (`org.mpris.MediaPlayer2`, with `Identity` and `DesktopEntry`) and the `Player` interface on `@homebridge/dbus-native` (pure JavaScript, so `npm run check:dist` has no native module to find), under `org.mpris.MediaPlayer2.<FLATPAK_ID>`, or `org.mpris.MediaPlayer2.tunelle` and the desktop entry `tunelle` that the AppImage launcher writes. The service keeps the last state it got and answers `Position` on demand (the position of that state, moved on while it plays); a client that polls gets the right number without the page sending it. `PropertiesChanged` goes out for what changed, `Seeked` for a jump.
- `client/hooks/use-mpris.ts` (called from `PlayerControls`) sends `MPRIS_STATE` (the track, whether it plays, the position, whether it was a seek: a position further than 1.5 seconds from where the playback would be) and `MPRIS_COVER`. `electron/listeners/register-mpris-listeners.ts` hands them to the service. Commands come back as `MPRIS_COMMAND` (play, pause, play or pause, stop, next, previous, seek to) and the same hook calls the player with them. `Raise` shows the window and `Quit` quits.
- A station has no length and cannot be seeked.
- Cover: the page fetches the cover (an address of the `tunelle` protocol, which the shell cannot open) and sends its bytes; `electron/services/mpris-cover.ts` writes them to `$XDG_RUNTIME_DIR/app/<FLATPAK_ID>/cover-<n>.<ext>`, a folder the Flatpak shares with the host (`$XDG_RUNTIME_DIR/tunelle` for the AppImage). Without `$XDG_RUNTIME_DIR` there is no cover and the controls show the track without one: the temp folder is shared with other users, so a file there would be an insecure temporary file (CodeQL). A new name for each cover, as the shell keeps what it read under the old one; the previous file is removed with the next one and at quit.
- Chromium's own service is switched off on Linux (`--disable-features=MediaSessionService` in `index.ts`), or the AppImage, which has no sandbox that denies the name, would show two players. The Flatpak has `--own-name=org.mpris.MediaPlayer2.io.github.koeroesi86.Tunelle` and no `chromium.*`.
- If there is no session bus or the name is taken, the error is logged and the app goes on without media controls.

## The dependency

`@homebridge/dbus-native` is maintained (releases in 2026), is pure JavaScript and has no native or vulnerable dependency. It is lower level than the library tried first (`dbus-next`, unmaintained since 2021, with a native `usocket` that fails to build on some runners and a vulnerable `xml2js`): an interface is a plain object plus a description of its members, `PropertiesChanged` and `Seeked` are sent with `sendSignal`, and a 64-bit value (`Position`, `mpris:length`, the argument of `Seek`) is a plain number, as a `BigInt` is sent as 0. Its type declaration covers only the client side, so `electron/services/dbus-native.d.ts` adds the members used here. A session bus address of the form `unix:abstract=...` is not handled by the library; the usual `unix:path=/run/user/<uid>/bus` of systemd is.

## Tests

The service and the cover files have unit tests, and the end to end test of the media controls (`e2e/system.spec.ts`) reads on Linux what the page sends to the main process, as the CI runners have no session bus. What the desktop shows is tried by hand in a Flatpak of the build (`docs/development/try-flatpak.md`).

## Not done

Volume, shuffle and loop are fixed values in the service (a client that sets them changes nothing), and `OpenUri` and the track list are not offered.

Try it in a Flatpak of your own build: [try-flatpak.md](../development/try-flatpak.md).
