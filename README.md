# Tunelle

Open-Source Lossless Audio Player

Website and downloads: <https://koeroesi86.github.io/tunelle/>

* [![Build](https://github.com/Koeroesi86/tunelle/actions/workflows/build.yml/badge.svg)](https://github.com/Koeroesi86/tunelle/actions/workflows/build.yml)


### Install

Windows, Linux and macOS builds exist for x64 (Intel/AMD) and arm64.

**Linux: install with Flatpak (recommended).** It works on every distribution with Flatpak, the runtime comes from Flathub and `flatpak update` brings every new release. One command adds the signed repository of the website and installs the app:

```sh
flatpak install --user https://koeroesi86.github.io/tunelle/repo/tunelle.flatpakref
flatpak run io.github.koeroesi86.Tunelle
```

Opening `https://koeroesi86.github.io/tunelle/repo/tunelle.flatpakref` in the browser does the same through GNOME Software or KDE Discover. To add only the repository, use `flatpak remote-add --user --if-not-exists tunelle https://koeroesi86.github.io/tunelle/repo/tunelle.flatpakrepo`. The repository holds the latest release. A `.flatpak` file from a release has no repository, so it does not update: install it again with the command above.

**Windows, macOS and Linux without Flatpak:** download the installer of your system and processor from the [latest release](https://github.com/Koeroesi86/tunelle/releases/latest); the app updates itself on start. On Linux the downloaded AppImage has to be made executable first: `chmod +x Tunelle-<version>-<arch>.AppImage`, then `./Tunelle-<version>-<arch>.AppImage` (or tick "Allow executing as a program" in the file manager). It needs FUSE 3: the kernel support and a `fusermount3` helper, which the `fuse3` package provides and desktop installs have. Without FUSE it runs with `APPIMAGE_EXTRACT_AND_RUN=1 ./Tunelle-<version>-<arch>.AppImage`. v26.10.2 and older also need FUSE 2 (`sudo dnf install fuse-libs` on Fedora, `sudo apt install libfuse2t64` on Ubuntu 24.04); without it nothing opens and the reason only shows when the AppImage is started from a terminal.


### Window blur

The parts of the window that are translucent show a blurred backdrop where the system provides one:

| System | Blur behind the window |
| :----- | :--------------------- |
| macOS | Built in (vibrancy), nothing to set up. |
| Windows | Not available yet; the window gets a darker, more opaque tint. |
| GNOME on Linux | Through the [Blur my Shell](https://extensions.gnome.org/extension/3193/blur-my-shell/) extension, see below. |
| Other Linux desktops | Only if the desktop blurs windows itself (for example a KDE Plasma blur rule); the app cannot ask for it. |

Electron cannot blur behind a window on Linux and the app cannot tell whether the desktop does, so it starts with opaque panels and a darker tint. Once the desktop blurs the window, choose **Use translucent panels** under **Window blur** on the Settings tab (**Use opaque panels** goes back). The choice is saved with the other settings.

#### GNOME with Blur my Shell

1. Install Blur my Shell from [extensions.gnome.org](https://extensions.gnome.org/extension/3193/blur-my-shell/) or the Extension Manager app, and turn it on.
2. In its preferences, open the **Applications** tab and turn on **Blur all windows** (or add `Tunelle` to the whitelist; the window class is `Tunelle`, `tunelle-dev` for a development run).
3. Turn off **Opaque focused window**. Left on, the extension blurs only windows that are not focused, so Tunelle would show no blur while you use it.
4. Leave **Opacity** at 255: the extension then keeps the window's own transparency and the blur shows through the translucent parts. Lower values make the whole window, panels included, more see-through.
5. In Tunelle, choose **Use translucent panels** on the Settings tab.

Tested with Blur my Shell 76 on GNOME 50 (Wayland). Without the extension, GNOME draws nothing behind the window, so keep the opaque panels there.

### Deving and Building

| Command            | Purpose                              |
| :----------------- | :----------------------------------- |
| `npm run dev`      | Start development server             |
| `MOCK_UPDATE=1 npm run dev` | Development server with a mocked update on the splash (nothing is installed) |
| `npm run build`    | Compile the app to `/out` and `/build`. |
| `npm run typecheck`| Type-check the whole project         |
| `npm run dist`     | Build for current OS                 |

### Website

The website is the static page in `site/` (plain HTML, CSS and one small script, no build tooling), published on GitHub Pages by `.github/workflows/pages.yml` when `site/` changes on `master` and after every release. `scripts/build-site.js` writes the latest release into a copy of the page while it is deployed (`{{version}}`, `{{notes}}` and `{{asset:<system>-<arch>}}` in `site/index.html`), so the download links follow the release without an edit. To look at it, run `npm run site` and open <http://localhost:4173/> (`node scripts/serve-site.js <port>` for another port): it serves `site/` with the latest release written in and reads the files on every request, so an edit shows after a reload. The install steps are written here and on the page, so change both. Under Settings, Pages, the source has to be **GitHub Actions**.
