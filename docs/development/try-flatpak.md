# Trying a Flatpak of the current code

`scripts/tooling/try-flatpak.sh` builds a Flatpak from the current code under an id of its own, `io.github.koeroesi86.TunelleTry`, and installs it for your user. It sits beside the real app (`io.github.koeroesi86.Tunelle`): another id, another data folder (`~/.var/app/io.github.koeroesi86.TunelleTry`) and another desktop entry named Tunelle Try. It needs `flatpak` and `flatpak-builder` with the runtime and base app of `package.json` (`build.flatpak`) from Flathub.

```sh
scripts/tooling/try-flatpak.sh build     # npm run build, then the bundle in dist/try-flatpak (a few minutes)
scripts/tooling/try-flatpak.sh install
scripts/tooling/try-flatpak.sh run       # with the updater off
scripts/tooling/try-flatpak.sh inspect   # the MPRIS services on the bus, with the state of each
scripts/tooling/try-flatpak.sh remove    # the app, its data, the build and the cover
```

`scripts/tooling/try-flatpak.js` writes the whole electron-builder configuration of the build to `dist/try-flatpak/config.json`, because electron-builder joins the arrays of a configuration object (the finish args) with those of `package.json`, which would keep the name of the real id. The finish arg `--own-name=org.mpris.MediaPlayer2.<id>` is set for the id of the build.

What to look at for the media controls ([mpris.md](../app/mpris.md)): the popup of the desktop (icon, title, artist, cover and the buttons), the media keys, `playerctl`, and that `inspect` lists one player, not a second `chromium` one.
