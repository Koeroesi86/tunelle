# The ffmpeg build

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302): a decoder proxy plays the formats that Chromium cannot (FLAC, ALAC, APE, WavPack, AIFF, DSD and others) by decoding them to PCM with ffmpeg. This page is about the build of that ffmpeg and how it is packaged. WAV, Opus, MP3, MP2, FLAC, Ogg Vorbis, ALAC, APE, WavPack, AIFF, DSD and WMA play through it ([decoder-proxy.md](../app/decoder-proxy.md)); the other formats follow.

## What is built

A decode-only ffmpeg and ffprobe, built by us from the source tarball of ffmpeg.org, with `--disable-gpl --disable-nonfree --disable-version3 --disable-everything` and then only the demuxers, decoders, `file` and `pipe` protocols, the WAV muxer and the raw `s16le`, `s24le` and `s32le` muxers (the progressive decode pipes raw samples, see decoder-proxy.md) with the PCM encoders and the resampling filters that are listed in `scripts/ffmpeg/ffmpeg-source.json`. It has no network, no external libraries (`--disable-autodetect`) and no encoder of a lossy codec. The result is LGPL 2.1 or later and runs as a separate executable, not linked into the app.

`ffmpeg-source.json` is the one place for the version, the URL, the sha256 of the tarball, the configure flags, the flags that must never appear and the decoders the binary must report. The Flatpak module reads the same file.

## The check

`node scripts/ffmpeg/ffmpeg-build.js <work folder> [<folder to keep the tarball in>]` downloads the tarball (up to four attempts with a growing wait after a network failure or a 5xx or 429 answer, as ffmpeg.org drops some of the parallel downloads of the runners), refuses it unless the sha256 matches, unpacks it from memory, builds, and then checks the binary: its configuration has no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`, and `ffmpeg -decoders` lists exactly the decoders of the file. A format is added to the build by adding its demuxer and decoder to the file, in the pull request that adds its playback test.

## CI

`.github/workflows/ffmpeg.yml` builds on Linux (x64, arm64), macOS (arm64, x64) and Windows (x64 with gcc, arm64 with clang, both in MSYS2). `dist.yml`, `test.yml` and `perf.yml` call it before their system jobs, and those jobs get the binary with the action `.github/actions/restore-ffmpeg`, which restores the cache and copies it to `.cache/ffmpeg/install/bin`. There is no artifact. A job that plays the generated FLAC albums without it hears silence (the perf job failed with `a tone of 440 Hz` at 0 Hz for that reason); `perf.yml` also copies it next to the build of the base branch.

- The build is kept in a cache keyed on the platform, the architecture, `ffmpeg-source.json` and `ffmpeg-build.js` (not on the runner image, so the Flatpak job on `ubuntu-latest` uses the build that the AppImage system, Ubuntu 22.04, made).
- The job `plan` runs first on one Ubuntu runner and lists with `gh cache list` the systems that have no cache for the current key, on the ref of the run or on the default branch (the two a run can read). `build` runs for those systems only, so a run with every build cached starts no macOS or Windows runner, which wait for a long time for a machine. A failed lookup counts as a missing cache, and the build runs.
- `plan` needs `actions: read`, and a called workflow gets at most what its caller has, so `pr-checks.yml`, `build.yml` and `release.yml` grant it at the top. Without it the run ends with `startup_failure` and no job starts, with nothing in the logs to read.
- The restore fails on a miss (`fail-on-cache-miss`): a cache that GitHub evicted between `plan` and the job is a rerun, not a silent wrong binary. `plan` is the one list of the systems; `workflows.test.ts` checks that the callers only restore systems in it.
- The checked source tarball is kept in a second cache keyed on the system and its sha256 (the folder is the second argument of the script), so a change of the build script or the flags builds again without downloading it.

It can be started by hand too. Updating ffmpeg means changing the version, URL and sha256 together (and the same three in `packaging/ffmpeg/NOTICE.txt`, which `dist.test.ts` checks).

## Packaging

`npm run ffmpeg` builds it for the machine into `.cache/ffmpeg/install/bin`, and `dist.yml` restores the cached build there. `npm run dist` fails without it, and `package.json` (`build.extraResources`) copies `ffmpeg` (not `ffprobe`) and `packaging/ffmpeg/` into `ffmpeg/` of the resources of the app, outside `app.asar`, so it can be run:

- `ffmpeg` (`ffmpeg.exe` on Windows), the program; replacing it with another build of ffmpeg is allowed, as the LGPL asks.
- `NOTICE.txt`: what it is, the version, the source URL and sha256, and where the build script and flags are. This is the source offer: the pinned tarball of ffmpeg.org plus `scripts/ffmpeg/` in the repository, no patch.
- `COPYING.LGPLv2.1`, the license text from the source.

The About page names ffmpeg and its license, and a button opens `NOTICE.txt` (`OPEN_FFMPEG_NOTICE`). `npm run check:dist` fails unless the three files are in the package and the packaged program reports an LGPL configuration and the listed decoders, which also shows that it runs.

## Flatpak and Flathub

Flathub builds everything from source and accepts no binary, so the CI binary cannot go there. `packaging/flatpak/ffmpeg-module.json` is a flatpak-builder module that builds the same ffmpeg from the pinned tarball (`archive` source with the sha256, no network during the build) with the configure flags of `ffmpeg-source.json`. It installs the program to `/app/ffmpeg/ffmpeg` and the license texts to `/app/share/licenses/<app id>/ffmpeg/`. `npm run ffmpeg:flatpak` writes it from the source file (`scripts/ffmpeg/flatpak-module.js`), and `flatpak-module.test.ts` fails when the committed file is out of step, so the flags stay in one place. It is not part of the bundle that `dist.yml` builds, which still packages the CI binary; the manifest of the app for Flathub lists the module before the app and links `/app/ffmpeg` to `ffmpeg/` of the resources of the app. WMA (the `asf` demuxer and the `wma` decoders) and MP3 (the `mp3` demuxer, the `mp3float` decoder and the `mpegaudio` parser) and MP2 (the `mp2float` decoder), listed in `flatpakExcluded` of `ffmpeg-source.json`, are in the CI build but filtered out of the module, so they stay out of the Flatpak until the Flathub reviewers have been asked about the codecs ([#347](https://github.com/Koeroesi86/tunelle/issues/347), [#484](https://github.com/Koeroesi86/tunelle/issues/484)). The patents of MP3 and MP2 are reported expired, so this is caution, not a known problem. In the Flatpak the decode of an MP3 fails at once (no decoder), and `playableFile` then serves the file itself, which Chromium plays (`isChromiumCodec` in `electron/utils/is-supported.ts`), so MP3 plays there and sounds as it did before the decoder proxy took it, with the cost of one failed ffmpeg start per play and a logged error. A codec that Chromium does not play (WMA, MP2, AC-3) has no such fallback and is not played in the Flatpak. Every codec that is added for patents reasons that are only probably over goes into `flatpakExcluded` the same way until the question is answered.

## Patents

WMA is in the build ([#347](https://github.com/Koeroesi86/tunelle/issues/347)): the patent that describes the codec, [US 7,158,539 B2](https://patents.google.com/patent/US7158539B2/en), has expired, and the notice shipped with the app (`packaging/ffmpeg/NOTICE.txt`) refers to it. This is the maintainer's reading, not legal advice, and other claims on the codec may exist. The other patent-heavy codec (AC-3) stays out of the build until the question of patents and Flathub is decided for each. The Flathub question stays open for all of them.

### Research for MP3, AAC and Opus (2026-11-24)

Not legal advice: a web search, not a patent database, so every date below is a third party's claim. Nothing of these three is in the build yet; each waits for the decision of the maintainer ([#470](https://github.com/Koeroesi86/tunelle/issues/470), [#471](https://github.com/Koeroesi86/tunelle/issues/471), [#469](https://github.com/Koeroesi86/tunelle/issues/469)).

- **MP3:** Technicolor and Fraunhofer ended their MP3 licensing programme on 23 April 2017. The last US patents are reported to have expired by April 2017 and the European ones around 2012. Fraunhofer's announcement gives no dates, and a third party may still hold a patent. Lowest risk of the three.
- **AAC:** AAC-LC is reported expired around 2017 (a forum claim; Fedora ships an AAC-LC only decoder on that reading). The Via LA AAC programme is still running and covers HE-AAC v1 and v2. Some Philips patents of the pool expired on 22 April 2023, a trade article puts the baseline technologies at 2028 and some extensions at 2031, and the two do not agree. If AAC comes in, AAC-LC and ADTS are the safer part; HE-AAC (SBR, PS) and the `.m4b` and `.m4r` variants need the decision.
- **Opus:** Xiph, Broadcom and Microsoft grant royalty-free licences, which end for anyone who sues Opus users. Qualcomm, Huawei, France Telecom and Ericsson filed IETF disclosures with possibly royalty-bearing terms. Vectis IP started a paid pool in January 2023 (Fraunhofer and Dolby, over 300 patents, about 15 cents a unit) aimed at hardware makers; Vectis says open implementations, apps and services are not affected, and whether the patents read on Opus is disputed.
- **Flathub:** no written policy on bundling MP3 or AAC was found. Flathub ships patented codecs as an `ffmpeg-full` extension that an app opts into, so a bundled decoder still needs a check.

Sources: Via LA AAC programme (via-la.com/licensing-2/aac), Opus license (opus-codec.org/license), IPWatchdog on the Vectis pool, LWN 910848, Mozilla Connect "Native AAC-LC decoding (patents expired)", The Broadcast Bridge on HE-AAC, Techdirt and Slashdot on the end of the MP3 programme.

### Research for MP2 (2026-11-24)

Not legal advice, and the same limits as above: secondary sources only, no patent database, no date below is checked. MP2 (MPEG-1 Audio Layer II, from the MUSICAM format) is in the build ([#347](https://github.com/Koeroesi86/tunelle/issues/347)) and in `flatpakExcluded`.

- Nobody was found who gives an expiry date for the Layer II patents. A Fedora legal list post by a non-lawyer reasons from the age of ISO 11172 (1993) that patents on it are highly likely expired, which is an estimate from the 20 year term, not a finding.
- Wikipedia's article on TooLAME says that the use of MP2 was basically unrestricted while MP3 faced the Fraunhofer and Thomson claims, and a legacy codecs article says the Layer II patents ran out before the MP3 ones. Both are third party statements.
- The MPEG-2 video and systems patents are reported expired in February 2018 (Slashdot, TechRepublic). That is a different part of the standard and is no evidence for audio.
- Flathub: the same open question as for MP3.

Sources: [Fedora legal list thread](https://lists.fedoraproject.org/archives/list/legal@lists.fedoraproject.org/thread/EAE7SDSHLA3S3D3APIDRDW22LQANFTSE/), [TooLAME on Wikipedia](https://en.wikipedia.org/wiki/TooLAME), [MP3 and MP2 legacy codecs](https://www.forasoft.com/learn/audio-for-video/articles-audio/mp3-mp2-legacy-codecs), [Slashdot on MPEG-2](https://yro.slashdot.org/story/18/02/14/1621259/mpeg-2-patents-have-expired), [TechRepublic on MPEG-2](https://www.techrepublic.com/article/mpeg-2-patent-expiration-opens-door-for-royalty-free-use/).

## Not decided here

The checks of the Microsoft Store (WACK) on the program are a later item of the issue.
