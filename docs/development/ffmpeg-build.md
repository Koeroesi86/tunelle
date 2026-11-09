# The ffmpeg build

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302): a decoder proxy plays the formats that Chromium cannot (ALAC, APE, WavPack, AIFF, DSD and others) by decoding them to PCM with ffmpeg. This page is about the build of that ffmpeg. Nothing ships it yet.

## What is built

A decode-only ffmpeg and ffprobe, built by us from the source tarball of ffmpeg.org, with `--disable-gpl --disable-nonfree --disable-version3 --disable-everything` and then only the demuxers, decoders, `file` and `pipe` protocols, the WAV muxer with its PCM encoders and the resampling filters that are listed in `scripts/ffmpeg/ffmpeg-source.json`. It has no network, no external libraries (`--disable-autodetect`) and no encoder of a lossy codec. The result is LGPL 2.1 or later and runs as a separate executable, not linked into the app.

`ffmpeg-source.json` is the one place for the version, the URL, the sha256 of the tarball, the configure flags, the flags that must never appear and the decoders the binary must report. The Flatpak module (a later item of the issue) reads the same file.

## The check

`node scripts/ffmpeg/ffmpeg-build.js <work folder>` downloads the tarball, refuses it unless the sha256 matches, builds, and then checks the binary: its configuration has no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`, and `ffmpeg -decoders` lists exactly the decoders of the file. A format is added to the build by adding its demuxer and decoder to the file, in the pull request that adds its playback test.

## CI

`.github/workflows/ffmpeg.yml` builds on Linux (x64, arm64), macOS (arm64, x64) and Windows (x64, in MSYS2) when `scripts/ffmpeg/` changes and by hand, and keeps the binaries for 7 days as artifacts. Updating ffmpeg means changing the version, URL and sha256 together.

## Not decided here

The patent-heavy codecs (WMA, AC-3, MP2) stay out of the build until the question of patents and Flathub is decided. The notices, the source offer and the packaging are the next item of the issue.
