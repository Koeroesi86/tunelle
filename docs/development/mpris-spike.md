# MPRIS spike (#258, #16)

A throwaway spike for an own MPRIS service under the Flatpak ID. It answers the open questions of #258 by hand, before the service is built. Nothing here is for a release: the service starts only with `TUNELLE_MPRIS_SPIKE=1`, plays fixed demo tracks and is not linked to the player.

## What is in it

- `electron/services/mpris-spike.ts`: the root and the player interface on `dbus-next`, under `org.mpris.MediaPlayer2.$FLATPAK_ID` (`org.mpris.MediaPlayer2.tunelle` outside Flatpak), with `DesktopEntry`, three demo tracks, a cover file under `$XDG_RUNTIME_DIR/app/<id>/`, `Position` answered on demand and `Next`, `Previous`, `Play`, `Pause` changing the state and sending `PropertiesChanged`.
- `index.ts`: `TUNELLE_MPRIS_SPIKE=1` starts it; `TUNELLE_MPRIS_DISABLE_FEATURES=<list>` is passed to Chromium as `--disable-features` (Linux and Flatpak only for now).
- `scripts/spike/build-mpris-flatpak.js` builds a Flatpak with the id `io.github.koeroesi86.TunelleSpike`, which installs beside the real app and has its own data and desktop entry, with `--own-name=org.mpris.MediaPlayer2.io.github.koeroesi86.TunelleSpike` and no `chromium.*`.
- `scripts/spike/mpris-flatpak.sh` builds, installs, runs, inspects and removes it.

## Trying it

```sh
scripts/spike/mpris-flatpak.sh build
scripts/spike/mpris-flatpak.sh install
scripts/spike/mpris-flatpak.sh run                                    # 1
scripts/spike/mpris-flatpak.sh run --spike                            # 2
scripts/spike/mpris-flatpak.sh run --spike --chromium-name            # 3
scripts/spike/mpris-flatpak.sh run --spike --chromium-name --disable-features=MediaSessionService   # 4
scripts/spike/mpris-flatpak.sh inspect                                # in a second terminal, while one runs
scripts/spike/mpris-flatpak.sh remove
```

Play a track or a station in the window for 1, as the demo tracks only exist with `--spike`. For each run, write down: which services `inspect` lists, what GNOME shows (icon, title, cover, buttons), whether the media keys and `playerctl` reach it, and the log lines `[mpris-spike]` and any Chromium error about the bus name.

| Run | Question |
| --- | --- |
| 1 | Without the permission, does Chromium's service fail silently, and do the media keys stop? |
| 2 | With the permission missing, is our service the only one, and does the icon come from `DesktopEntry`? |
| 3 | With both allowed, does GNOME show two players? |
| 4 | Does `MediaSessionService` remove Chromium's one, and do the keys still reach ours? Try `HardwareMediaKeyHandling` too. |

`remove` takes the app, its data (`~/.var/app/io.github.koeroesi86.TunelleSpike`) and `dist/mpris-spike` away. The real `io.github.koeroesi86.Tunelle` is not touched.

## Library

`dbus-next` 0.10.2 is in the spike: pure JavaScript (228 kB, no native build), has types, and exports the interfaces with methods, properties and signals. It works against the session bus in plain Node (a call to `Next` changed the metadata, `Position` and `DesktopEntry` answered). Its last release is from 2022, and it depends on `event-stream` 3.3.4 (a version from before the 2018 incident, but one that dependency review and OSV may flag). `@homebridge/dbus-native` 0.7.9 (released 2026-10-24) is maintained and lower level; it was not tried.

## Not verified

- Every question in the table: the spike was built and the bundle checked (id, finish args), but not installed or run in a shell.
- `npm run check:dist` and `fallow` with the dependency in the package.
- The cover under the sandbox, KDE, and `playerctl`.
- Windows and macOS (the spike is Linux only).
