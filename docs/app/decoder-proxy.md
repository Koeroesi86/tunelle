# The decoder proxy

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302). Chromium plays the audio of the app, so a format it cannot decode is decoded by the bundled ffmpeg ([ffmpeg-build.md](../development/ffmpeg-build.md)) to a WAV file first, and the `/track` route serves that file. The address the renderer asks for does not change, so the `<audio>` elements, the Web Audio graph, gapless playback and the rest stay as they are. Only the codecs in `decodedCodecs` of `electron/utils/is-supported.ts` take this way: ALAC (in an `.m4a`), Monkey's Audio (`.ape`), WavPack (`.wv`) and AIFF (`.aiff`, `.aif`) with AIFC (`.aifc`), told apart by the `codec` the scan read.

## The route

`/track` looks the path up in the library (`findPlayableTrack`: path, codec, bit depth) and asks `playableFile` (`electron/protocols/decoded-track.ts`) for the file to serve: the file itself, or the decoded copy. `serveFile` then answers it with its size and ranges, so seeking works as for any other track. A decode that fails, or whose request is gone, answers 404, and the player skips the track as for a file it cannot open.

The first play of a track waits for the whole decode, and the page gets the answer after that. Streaming with range restarts is not built; time the formats with long decodes (APE, DSD) before it is.

## The decode

`ffmpeg -nostdin -v error -fflags +bitexact -i <file> -map 0:a:0 -map_metadata -1 -c:a <pcm> -f wav -y <cache>/<key>.wav.part`. The sample rate and the channels stay as in the file (the audio context resamples), the depth too: 16 bit or less is `pcm_s16le`, up to 24 `pcm_s24le`, above `pcm_s32le`, and 16 when the library has none. The output is written as `.part` and renamed when ffmpeg ends well, so a file of the cache is whole. A failure removes the `.part` file and logs the error of ffmpeg.

- The program is `ffmpeg/ffmpeg` of the resources of the packaged app, and `.cache/ffmpeg/install/bin/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise.
- Requests for the same track meanwhile share one decode. It is killed when the last request waiting for it is aborted (the page leaves the track), and not before.
- At most two decodes run at the same time, the others wait for a place.

## The cache

`tunelle-decoded` in the temp folder of the system. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

After each decode the oldest files are removed until the folder is under 2 GiB (a 24/96 album is some hundreds of MB), except the files being written and the three served last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. Stale `.part` files go the same way.

## Tests

`decoded-track.test.ts` runs the cache, the sharing, the abort, the limit and the eviction with a fake child process; `tunelle-protocol.test.ts` the route; `e2e/alac.spec.ts`, `e2e/ape.spec.ts`, `e2e/wavpack.spec.ts` and `e2e/aiff.spec.ts` play ALAC, Monkey's Audio, WavPack and AIFF fixtures (`e2e/fixtures/alac/`, `e2e/fixtures/ape/`, `e2e/fixtures/wavpack/`, `e2e/fixtures/aiff/`) with the real ffmpeg and measures the tone that leaves the app.

Decode time of Monkey's Audio, measured on a laptop: a 10 minute 24 bit, 96 kHz stereo file at the insane level took 13.6 s (about 44 times faster than playing). The file was a pure tone, which compresses far better than music, so real albums take longer.
