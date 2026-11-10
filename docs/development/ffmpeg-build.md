# The ffmpeg build

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302): a decoder proxy plays the formats that Chromium cannot (ALAC, APE, WavPack, AIFF, DSD and others) by decoding them to PCM with ffmpeg. This page is about the build of that ffmpeg and how it is packaged. ALAC plays through it ([decoder-proxy.md](../app/decoder-proxy.md)); the other formats follow.

## What is built

A decode-only ffmpeg and ffprobe, built by us from the source tarball of ffmpeg.org, with `--disable-gpl --disable-nonfree --disable-version3 --disable-everything` and then only the demuxers, decoders, `file` and `pipe` protocols, the WAV muxer with its PCM encoders and the resampling filters that are listed in `scripts/ffmpeg/ffmpeg-source.json`. It has no network, no external libraries (`--disable-autodetect`) and no encoder of a lossy codec. The result is LGPL 2.1 or later and runs as a separate executable, not linked into the app.

`ffmpeg-source.json` is the one place for the version, the URL, the sha256 of the tarball, the configure flags, the flags that must never appear and the decoders the binary must report. The Flatpak module (a later item of the issue) reads the same file.

## The check

`node scripts/ffmpeg/ffmpeg-build.js <work folder>` downloads the tarball, refuses it unless the sha256 matches, unpacks it from memory, builds, and then checks the binary: its configuration has no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`, and `ffmpeg -decoders` lists exactly the decoders of the file. A format is added to the build by adding its demuxer and decoder to the file, in the pull request that adds its playback test.

## CI

`.github/workflows/ffmpeg.yml` builds on Linux (x64, arm64), macOS (arm64, x64) and Windows (x64 with gcc, arm64 with clang, both in MSYS2). `dist.yml` calls it, so every pull request and release has the binary of each system as the artifact `ffmpeg-<platform>-<arch>`; the build is kept in a cache keyed on the runner, `ffmpeg-source.json` and `ffmpeg-build.js`, so it only runs when one of them changes. It can be started by hand too. Updating ffmpeg means changing the version, URL and sha256 together (and the same three in `packaging/ffmpeg/NOTICE.txt`, which `dist.test.ts` checks).

## Packaging

`npm run ffmpeg` builds it for the machine into `.cache/ffmpeg/install/bin`, and `dist.yml` downloads the artifact there. `npm run dist` fails without it, and `package.json` (`build.extraResources`) copies `ffmpeg` (not `ffprobe`) and `packaging/ffmpeg/` into `ffmpeg/` of the resources of the app, outside `app.asar`, so it can be run:

- `ffmpeg` (`ffmpeg.exe` on Windows), the program; replacing it with another build of ffmpeg is allowed, as the LGPL asks.
- `NOTICE.txt`: what it is, the version, the source URL and sha256, and where the build script and flags are. This is the source offer: the pinned tarball of ffmpeg.org plus `scripts/ffmpeg/` in the repository, no patch.
- `COPYING.LGPLv2.1`, the license text from the source.

The About page names ffmpeg and its license, and a button opens `NOTICE.txt` (`OPEN_FFMPEG_NOTICE`). `npm run check:dist` fails unless the three files are in the package and the packaged program reports an LGPL configuration and the listed decoders, which also shows that it runs.

## Not decided here

The patent-heavy codecs (WMA, AC-3, MP2) stay out of the build until the question of patents and Flathub is decided. The Flatpak packages the CI binary for now; a source module for Flathub, and the checks of the Microsoft Store (WACK) on the program, are later items of the issue.
