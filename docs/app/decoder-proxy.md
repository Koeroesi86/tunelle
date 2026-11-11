# The decoder proxy

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302). Chromium plays the audio of the app, so a format it cannot decode is decoded by the bundled ffmpeg ([ffmpeg-build.md](../development/ffmpeg-build.md)) to a WAV file first, and the `/track` route serves that file. The address the renderer asks for does not change, so the `<audio>` elements, the Web Audio graph, gapless playback and the rest stay as they are. Only the codecs in `decodedCodecs` of `electron/utils/is-supported.ts` take this way: ALAC (in an `.m4a`), Monkey's Audio (`.ape`), WavPack (`.wv`) AIFF (`.aiff`, `.aif`) with AIFC (`.aifc`) DSD (`.dsf`, `.dff`) and WMA (`.wma`, `.asf`), told apart by the `codec` the scan read.

## The route

`/track` looks the path up in the library (`findPlayableTrack`: path, codec, bit depth) and asks `playableFile` (`electron/protocols/decoded-track.ts`) for the file to serve: the file itself, or the decoded copy. `serveFile` then answers it with its size and ranges, so seeking works as for any other track. A decode that fails, or whose request is gone, answers 404, and the player skips the track as for a file it cannot open.

The first play of a track waits for the whole decode, and the page gets the answer after that. Streaming with range restarts is not built: the slowest decode measured (below) is short enough.

## The decode

`ffmpeg -nostdin -v error -fflags +bitexact -i <file> -map 0:a:0 -map_metadata -1 -c:a <pcm> -f wav -y <cache>/<key>.wav.part`. The sample rate and the channels stay as in the file (the audio context resamples), the depth too: 16 bit or less is `pcm_s16le`, up to 24 `pcm_s24le`, above `pcm_s32le`, and 16 when the library has none. The output is written as `.part` and renamed when ffmpeg ends well, so a file of the cache is whole. A failure removes the `.part` file and logs the error of ffmpeg.

- The program is `ffmpeg/ffmpeg` of the resources of the packaged app, and `.cache/ffmpeg/install/bin/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise.
- Requests for the same track meanwhile share one decode. It is killed when the last request waiting for it is aborted (the page leaves the track), and not before.
- At most two decodes run at the same time, the others wait for a place.

## The cache

`tunelle-decoded` in the temp folder of the system. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

After each decode the oldest files are removed until the folder is under 2 GiB (a 24/96 album is some hundreds of MB), except the files being written and the three served last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. Stale `.part` files go the same way.

## Tests

`decoded-track.test.ts` runs the cache, the sharing, the abort, the limit and the eviction with a fake child process; `tunelle-protocol.test.ts` the route; `e2e/alac.spec.ts` plays the ALAC fixture (`e2e/fixtures/alac/`) with the real ffmpeg and measures the tone that leaves the app, which shows that Chromium plays what the decoder proxy serves; `e2e/dsd.spec.ts` does the same for DSD and also measures the loudness, as it is the one that is 24 bit at 88.2 kHz. The other formats (Monkey's Audio, WavPack, AIFF, WMA) go through the same route and are not played in `e2e/`. `electron/protocols/decoded-track.integration.test.ts` and `decoded-loudness.integration.test.ts` scan the fixtures of all six formats and check the decoded WAV of each: the tone and the length, and the loudness that the code of `client/loudness/` gives it against an ideal sine (docs/development/integration-tests.md).

Decode time of Monkey's Audio, measured on a laptop: a 10 minute 24 bit, 96 kHz stereo file at the insane level took 13.6 s (about 44 times faster than playing). The file was a pure tone, which compresses far better than music, so real albums take longer.

## DSD

The 1 bit of a DSD file says nothing about the depth of the WAV, so a DSD file of any rate (DSD64, DSD128, DSD256) is decoded to 88.2 kHz and 24 bit (`-ar 88200 -c:a pcm_s24le`, set by `toEncoder` in `decoded-track.ts`). Chromium resamples to the rate of the device anyway, and 88.2 kHz is an exact 2:1 step to 44.1 kHz. A stereo file of 5 minutes is about 160 MB in the cache.

- Timing: a DSD64 stereo file of 5 minutes (211 MB) decoded in 0.7 s on a laptop, so DSD128 and DSD256 take a few seconds at most, and the first play does not need streaming.
- Level: the decoder adds no gain (a tone at 0.9 of full scale came out at -0.9 dB), so a master that peaks at 0 dBFS or above in the DSD can clip in the 24 bit WAV. No gain is applied by default.
- The library keeps the source format (codec `DSD`, 1 bit, the rate of the file), so the badge reads like `DSD 1/2822.4`.
- DST (compressed DSDIFF) and WavPack files that hold DSD (codec `DSD-WAVPACK`) are not decoded and stay out of the library.
