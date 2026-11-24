# The decoder proxy

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302). Chromium plays the audio of the app, so a format it cannot decode is decoded by the bundled ffmpeg ([ffmpeg-build.md](../development/ffmpeg-build.md)) to a WAV file first, and the `/track` route serves that file. The address the renderer asks for does not change, so the `<audio>` elements, the Web Audio graph, gapless playback and the rest stay as they are. Only the codecs in `decodedCodecs` of `electron/utils/is-supported.ts` take this way: WAV (`.wav`, every PCM, float, ADPCM, A-law and µ-law variant), Ogg Vorbis (`.ogg`, `.oga`), FLAC (`.flac`, and Ogg FLAC in an `.ogg` or `.oga`), ALAC (in an `.m4a`), Monkey's Audio (`.ape`), WavPack (`.wv`) AIFF (`.aiff`, `.aif`) with AIFC (`.aifc`) DSD (`.dsf`, `.dff`) and WMA (`.wma`, `.asf`), told apart by the `codec` the scan read.

## The route

`/track` looks the path up in the library (`findPlayableTrack`: path, codec, bit depth) and asks `playableFile` (`electron/protocols/decoded-track.ts`) for the file to serve: the file itself, or the decoded copy. `serveFile` then answers it with its size and ranges, so seeking works as for any other track. A decode that fails, or whose request is gone, answers 404, and the player skips the track as for a file it cannot open.

The first play of a track waits for the whole decode, and the page gets the answer after that. Streaming with range restarts is not built: the slowest decode measured (below) is short enough.

## The progressive decode

A codec whose length in frames is exact before the decode (ALAC, FLAC, APE, WavPack, AIFF, WAV and float WAV; `progressiveCodecs` in `electron/utils/is-supported.ts`) is served while ffmpeg writes it (`growing-track.ts`, `serve-growing.ts`). `ffprobe` (`probe-audio.ts`) gives the channels, the rate and the frames, only when the time base of the stream is one frame (`1/<rate>`); the header of the WAV (`wav-header.ts`) is then written with the size that the file will have, and the answer to the page has that size and the ranges of the finished file. ffmpeg writes raw samples to a pipe (the `s16le`, `s24le` and `s32le` muxers of the build), the app appends them to the `.part` file after the header and a read waits for the bytes that are not written yet, so the track starts at once and a seek far ahead waits for the decode to get there.

- A decode is not stopped when a request goes: several range reads share the file, so it runs to the end and stays in the cache.
- A byte count that differs from the declared size drops the file, and that track uses the whole decode from then on (until the app restarts).
- WMA and DSD have an inexact length and stay on the whole decode.
- The reader of a growing file opens it when the decode has its slot, so a read that comes first waits for the file.
- Not tried yet: a seek in the app while the decode runs. `growing-track.integration.test.ts` covers the real ffmpeg without Electron.

## The decode

`ffmpeg -nostdin -v error -fflags +bitexact -i <file> -map 0:a:0 -map_metadata -1 -c:a <pcm> -f wav -y <cache>/<key>.wav.part`. The sample rate and the channels stay as in the file (the audio context resamples), the depth too: 16 bit or less is `pcm_s16le`, up to 24 `pcm_s24le`, above `pcm_s32le`, and 16 when the library has none. The output is written as `.part` and renamed when ffmpeg ends well, so a file of the cache is whole. A failure removes the `.part` file and logs the error of ffmpeg.

- The program is `ffmpeg/ffmpeg` of the resources of the packaged app, and `.cache/ffmpeg/install/bin/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise.
- Requests for the same track meanwhile share one decode. It is killed when the last request waiting for it is aborted (the page leaves the track), and not before.
- At most two decodes run at the same time, the others wait for a place.

## The cache

`tunelle-decoded` in the temp folder of the system. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

After each decode the oldest files are removed until the folder is under 2 GiB (a 24/96 album is some hundreds of MB), except the files being written and the three served last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. Stale `.part` files go the same way.

## Tests

`decoded-track.test.ts` runs the cache, the sharing, the abort, the limit and the eviction with a fake child process; `tunelle-protocol.test.ts` the route; `e2e/functional/alac.spec.ts` plays the ALAC fixture (`e2e/fixtures/alac/`) with the real ffmpeg and measures the tone that leaves the app, which shows that Chromium plays what the decoder proxy serves; `e2e/functional/wav.spec.ts` plays the WAV fixture the same way; `e2e/functional/vorbis.spec.ts` does the same for Ogg Vorbis; `e2e/functional/dsd.spec.ts` does the same for DSD and also measures the loudness, as it is the one that is 24 bit at 88.2 kHz. The other formats (Monkey's Audio, WavPack, AIFF, WMA) go through the same route and are not played in `e2e/`. `electron/protocols/decoded-track.integration.test.ts` and `decoded-loudness.integration.test.ts` scan the fixtures of all the formats and check the decoded WAV of each: the tone and the length, and the loudness that the code of `client/loudness/` gives it against an ideal sine (docs/development/integration-tests.md).

Decode time of Monkey's Audio, measured on a laptop: a 10 minute 24 bit, 96 kHz stereo file at the insane level took 13.6 s (about 44 times faster than playing). The file was a pure tone, which compresses far better than music, so real albums take longer.

## FLAC

FLAC takes the same way since [#466](https://github.com/Koeroesi86/tunelle/issues/466), so what is heard no longer depends on the Chromium build of the system. The build has the `flac` and `ogg` demuxers, the `flac` decoder and parser (`ffmpeg-source.json`), so Ogg FLAC in an `.ogg` or `.oga` is decoded too. The depth of the file is kept (`toEncoder`): 16 bit FLAC gives `pcm_s16le`, 24 bit `pcm_s24le`. An embedded cover is a video stream and `-map 0:a:0` leaves it out of the WAV.

- Timing: a 10 minute stereo file of pink noise plus a tone, 44.1 kHz 16 bit (62 MB, the WAV is 106 MB), decoded in 0.14 s on a laptop, and one at 96 kHz 24 bit (136 MB, the WAV is 346 MB) in 0.19 s, so about 3000 to 4000 times faster than playing (warm file cache; a cold disk adds the time to read the file). The first play could wait for the whole decode; FLAC is served progressively anyway, like the other codecs with an exact length (see above), which also spares the wait on a cold disk.
- Size: the WAV of a 24/96 file is about 2.5 times the FLAC (2 times for 16 bit CD material), so the 2 GiB cache holds some hours of 24/96 music, and the three tracks that were served last are never removed.
- Gapless: FLAC has no encoder delay or padding, so the decoded WAV has exactly the samples of the file (6 s fixtures give 6 s in `decoded-track.integration.test.ts`) and nothing is trimmed. The two tracks join without a gap as ALAC does.

## DSD

The 1 bit of a DSD file says nothing about the depth of the WAV, so a DSD file of any rate (DSD64, DSD128, DSD256) is decoded to 88.2 kHz and 24 bit (`-ar 88200 -c:a pcm_s24le`, set by `toEncoder` in `decoded-track.ts`). Chromium resamples to the rate of the device anyway, and 88.2 kHz is an exact 2:1 step to 44.1 kHz. A stereo file of 5 minutes is about 160 MB in the cache.

- Timing: a DSD64 stereo file of 5 minutes (211 MB) decoded in 0.7 s on a laptop, so DSD128 and DSD256 take a few seconds at most, and the first play does not need streaming.
- Level: the decoder adds no gain (a tone at 0.9 of full scale came out at -0.9 dB), so a master that peaks at 0 dBFS or above in the DSD can clip in the 24 bit WAV. No gain is applied by default.
- The library keeps the source format (codec `DSD`, 1 bit, the rate of the file), so the badge reads like `DSD 1/2822.4`.
- DST (compressed DSDIFF) and WavPack files that hold DSD (codec `DSD-WAVPACK`) are not decoded and stay out of the library.
