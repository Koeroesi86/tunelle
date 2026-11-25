# The decoder proxy

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302). Chromium plays the audio of the app, so a format it cannot decode is decoded by the bundled ffmpeg ([ffmpeg-build.md](../development/ffmpeg-build.md)) to a WAV, and the `/track` route serves that WAV. The address the renderer asks for does not change, so the `<audio>` elements, the Web Audio graph, gapless playback and the rest stay as they are. Only the codecs in `decodedCodecs` of `electron/utils/is-supported.ts` take this way: Opus (`.opus`), MP3 (`.mp3`), MP2 (`.mp2`), AC-3 (in an `.m4a`), Matroska and WebM audio (`.mka`, `.weba`; FLAC, Opus and Vorbis in them), CAF (`.caf`; PCM, ALAC, A-law and µ-law in it), WAV (`.wav`, also RF64, and Wave64 `.w64`; every PCM, float, ADPCM, A-law and µ-law variant), Ogg Vorbis (`.ogg`, `.oga`), FLAC (`.flac`, and Ogg FLAC in an `.ogg` or `.oga`), ALAC (in an `.m4a`), Monkey's Audio (`.ape`), WavPack (`.wv`, also DSD in it) AIFF (`.aiff`, `.aif`) with AIFC (`.aifc`) DSD (`.dsf`, `.dff`) and WMA (`.wma`, `.asf`), told apart by the `codec` the scan read.

## The route

`/track` looks the path up in the library (`findPlayableTrack`: path, codec, bit depth) and serves it in one of two ways, both with the size and the ranges of the whole WAV, so seeking works as for any other track:

- a codec with an exact length is decoded in **windows in memory** where it is read (`windowedTrack`, `serveWindowed`), and nothing is written to disk;
- any other file goes to `playableFile` (`electron/protocols/decoded-track.ts`), which gives the file itself or a copy that is decoded whole into the cache, and `serveFile` answers it.

A whole decode that fails, or whose request is gone, answers 404, and the player skips the track as for a file it cannot open. Its first play waits for the whole decode, and the page gets the answer after that.

## The windowed decode ([#563](https://github.com/Koeroesi86/tunelle/issues/563))

The codecs are ALAC, FLAC, APE, WavPack, AIFF, WAV and float WAV (`progressiveCodecs` in `electron/utils/is-supported.ts`), up to two channels. `ffprobe` (`probe-audio.ts`) gives the channels, the rate and the frames, only when the time base of the stream is one frame (`1/<rate>`). The header of the WAV (`wav-header.ts`) and its size are therefore known before anything is decoded, and a request for the header alone starts no decode.

A window (`decode-window.ts`) is one ffmpeg run from the frame of the read that opened it (`-ss <frame / rate>` before `-i`, nine decimals), writing raw samples (the `s16le`, `s24le` and `s32le` muxers) to a pipe. The app takes from the pipe until it is the reach of the window ahead of the read, then stops taking, and ffmpeg waits on the full pipe. Bytes further behind the read than the reach are let go. `windowed-track.ts` picks a window for each read, and opens one when none can serve it:

- A read inside a window uses it: Chromium's re-reads and overlapping ranges start no new decode.
- A read outside every window (a seek) starts a new decode at its offset. The old window stays, so a seek back to it costs nothing while it is open.
- Readers share a window while they are close. One that runs more than the reach ahead of another gets its own decode, so a paused player never has to restart: the loudness measurement, which reads the whole track, splits off once.
- A window that has an open reader is kept however long that reader waits (a paused player does not read, and its request may stay open). One without a reader is dropped after 5 minutes, and a later request decodes again.
- The preloaded next track opens a window, decodes it and waits there.
- Windows do not take the two places of the whole decodes, as most of their time is spent waiting for the reader.
- A decode that gives another number of bytes than the file said is logged, and that track uses the whole decode from then on (until the app restarts). The CAF fixture with ALAC in it is one: `ffprobe` says 264600 frames and the decode gives 262960.
- A decode that fails ends the read, without being started again for it; a later request tries again.

Not tested: Windows and macOS in the real app. A window whose decode has not reached the end keeps ffmpeg running, so the source file stays open while the player is paused and for up to 5 minutes after the last read; on Windows that may block renaming or deleting the file.

## How much is decoded: the speed of the source

Constants are in `electron/protocols/decode-policy.ts`, the measurement in `source-speed.ts`. `prepareDecode` opens the file and reads its first 256 KiB once per volume (`stat.dev`), and keeps the result until the app restarts; the open and the read together that take over 50 ms (about 5 MB/s) makes the volume **slow**, anything else **fast**, and a file that cannot be read counts as slow.

| | fast source | slow source |
| --- | --- | --- |
| window ahead of a read | 5 s of audio | 10 s of audio |
| window behind a read | 4 MiB | 4 MiB |
| cache limit of whole decodes | 256 MiB | 2 GiB |

- There are at most 6 windows, and each may hold its share of 128 MiB. Only a rate above about 1.8 MB/s on a slow source (3.6 MB/s on a fast one) gets fewer seconds ahead than the table says: 192 kHz stereo at 32 bit is 1.5 MB/s. Each window has its own share, so windows only drop each other for their number, never for room: with one shared budget two busy readers could drop each other's window in turn without end. A window with no reader goes first, then the one used longest ago, and a reader whose window was dropped goes on in a new one.
- Measured on a laptop (NVMe, btrfs): the read of 256 KiB takes 0.2 to 0.3 ms with the file in the page cache. The 50 ms threshold is a margin of 200 times over that and was **not** measured on a network mount, a USB disk or a sleeping spinning disk; a cold NVMe read is expected in the low milliseconds. Move `slowAfterMs` when such a source is measured.
- A whole decode (WMA, DSD and the others) keeps the class of its copy in memory (`fastKeys` in `decoded-track.ts`), so after a restart the copies in the folder count as slow ones until they are served again.

### Why 4 MiB behind, in bytes

Symptom: with 5 s behind (0.9 MB at CD rate), resuming a track after a pause of some seconds started a new decode although the window was still there. Cause: when playback resumes, Chromium asks again from where **it** got to, and that was 1.8 MB (10 s) before where the last read of the main process had ended, most likely the data that was still on its way to the renderer when the request was given up. The amount follows the buffers, not the length of the audio, so the reach behind is a number of bytes. To check it: log the position of every new window and the held range of the others in `openWindow`, then pause and resume a track of some minutes in the real app; no window should open on resume. `windowed-track.test.ts` covers a re-read that far back.

### Seeking by `-ss`

An input `-ss` of `frame / rate` gives from that frame on the same bytes as the decode from the start, for every progressive codec: measured on the fixtures and on longer generated files (FLAC with and without a seek table, Ogg FLAC, 96 and 192 kHz 24 bit, WavPack, ALAC in MP4 and CAF, AIFF, WAV), and kept by `windowed-track.integration.test.ts`. ADPCM is not exact (up to 11 frames off for Microsoft ADPCM and 7 for IMA), which is fine only because it is not on this path.

Time until the first bytes arrive, at the start, the middle and the end of a stereo file at 96 kHz 24 bit, on a laptop with the file in the page cache:

| file | length | start | middle | end |
| --- | --- | --- | --- | --- |
| FLAC | 300 s | 5 ms | 6 ms | 5 ms |
| FLAC without a seek table | 300 s | 4 ms | 4 ms | 5 ms |
| Ogg FLAC | 300 s | 4 ms | 6 ms | 5 ms |
| WavPack | 300 s | 5 ms | 11 ms | 17 ms |
| ALAC (MP4) | 120 s | 5 ms | 4 ms | 6 ms |
| ALAC (CAF) | 120 s | 4 ms | 4 ms | 4 ms |
| AIFF | 120 s | 3 ms | 3 ms | 5 ms |
| WAV | 120 s | 6 ms | 5 ms | 5 ms |

Monkey's Audio was not measured on a long file (there is no encoder for it here), and no codec on a slow drive.

## The whole decode

`ffmpeg -nostdin -v error -fflags +bitexact -i <file> -map 0:a:0 -map_metadata -1 -c:a <pcm> -f wav -y <cache>/<key>.wav.part`. The sample rate and the channels stay as in the file (the audio context resamples), the depth too: 16 bit or less is `pcm_s16le`, up to 24 `pcm_s24le`, above `pcm_s32le`, and 16 when the library has none. The output is written as `.part` and renamed when ffmpeg ends well, so a file of the cache is whole. A failure removes the `.part` file and logs the error of ffmpeg.

- The program is `ffmpeg/ffmpeg` of the resources of the packaged app, and `.cache/ffmpeg/install/bin/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise.
- Requests for the same track meanwhile share one decode. It is killed when the last request waiting for it is aborted (the page leaves the track), and not before.
- At most two decodes run at the same time, the others wait for a place.

## Radio stations and server tracks ([#562](https://github.com/Koeroesi86/tunelle/issues/562))

The same rule holds for the online sources: a format in `decodedCodecs` is decoded by the bundled ffmpeg, Chromium plays the rest.

- **Radio** (`radio-proxy.ts`, `stream-decode.ts`): the ICY metadata is stripped first, then the start of the stream (up to 64 KiB or 2 s, `peekStream`) is read until `detectStreamCodec` names the codec (MP3 and ADTS AAC by two frames in a row, Opus, Vorbis and FLAC in Ogg by the header of the codec, native FLAC by `fLaC`). A codec of `decodedCodecs` goes to `ffmpeg -i pipe:0 ... -f wav pipe:1` and the response is `audio/wav` of no set length; nothing is written to disk. The sample rate comes from the header of the decoded WAV. AAC (no decoder in the build, see [#549](https://github.com/Koeroesi86/tunelle/issues/549)) and a stream whose format is not named take the old path, Chromium decodes the bytes. If ffmpeg cannot start, or ends before it gave a byte (a build without the MP3 decoder, as the Flatpak), the stream plays in Chromium as before: the bytes that were read are replayed (`replay`), the few that ffmpeg took before it failed are lost, and Chromium finds the next frame. Closing the response kills ffmpeg and closes the connection to the station.
- **Server tracks** (`source-protocol.ts`, `source-download.ts`): the page adds the `codec` and `bitDepth` that the server's metadata gave (`track-source.ts`), as the server's stream has no codec before it is read. A codec of `decodedCodecs` is downloaded whole to `tunelle-source` of the temp folder (once for the requests that ask meanwhile, the three newest files stay, the download stops when the last request leaves) and then goes the way of a library file: the windowed or the whole decode, with ranges. A pipe cannot be sought, and an MP4 with its `moov` at the end cannot be read from one, so a track is not streamed through ffmpeg; the cost is that it starts when the download is done (on the local network a lossless track takes some seconds). A failed download or decode plays the server's own stream as before.
- Not built: restarting a stream at an offset for a range request, and a measured start-up delay of ffmpeg for an MP3 station. `stream-decode.integration.test.ts` runs the real ffmpeg on the fixtures through `serveRadio` and `serveSource`. Whether Chromium plays a WAV of unknown length from `<audio>` without trouble is not measured in `e2e/` yet.

## The cache

Only whole decodes are written to disk, to `tunelle-decoded` in the temp folder of the system; playing an album of a progressive codec adds nothing to it (`windowed-track.integration.test.ts` and `windowed-track.test.ts` check that). A whole decode takes rate × channels × bytes per sample × seconds, so 45 minutes of WMA at 44.1 kHz 16 bit stereo are about 480 MB and 45 minutes of DSD (88.2 kHz 24 bit) about 1.4 GB. Copies of progressive codecs that an earlier version left there are not served any more and go with the limit. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

After each decode the oldest files are removed until the copies of slow sources are under 2 GiB and the copies of fast sources under 256 MiB (see above) (a 24/96 album is some hundreds of MB), except the files being written and the three served last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. Stale `.part` files go the same way.

## Tests

`windowed-track.test.ts` runs the windows with a fake ffmpeg (the reach of a fast and of a slow source, a seek, a re-read, a paused reader, a second reader, the number and memory limits, a wrong length and a failure), `serve-windowed.test.ts` their ranges, `decode-policy.test.ts` and `source-speed.test.ts` (a fake source that answers late, or opens late) the policy, and `windowed-track.integration.test.ts` compares, with the real ffmpeg, the bytes from several offsets with the whole decode for every progressive codec. `decoded-track.limits.test.ts` covers the two cache limits. `decoded-track.test.ts` runs the cache, the sharing, the abort, the limit and the eviction with a fake child process; `tunelle-protocol.test.ts` the route; `e2e/functional/alac.spec.ts` plays the ALAC fixture (`e2e/fixtures/alac/`) with the real ffmpeg and measures the tone that leaves the app, which shows that Chromium plays what the decoder proxy serves; `e2e/functional/wav.spec.ts` plays the WAV fixture the same way; `e2e/functional/vorbis.spec.ts` does the same for Ogg Vorbis; `e2e/functional/dsd.spec.ts` does the same for DSD and also measures the loudness, as it is the one that is 24 bit at 88.2 kHz. The other formats (Monkey's Audio, WavPack, AIFF, WMA) go through the same route and are not played in `e2e/`. `electron/protocols/decoded-track.integration.test.ts` and `decoded-loudness.integration.test.ts` scan the fixtures of all the formats and check the decoded WAV of each: the tone and the length, and the loudness that the code of `client/loudness/` gives it against an ideal sine (docs/development/integration-tests.md).

Decode time of Monkey's Audio, measured on a laptop: a 10 minute 24 bit, 96 kHz stereo file at the insane level took 13.6 s (about 44 times faster than playing). The file was a pure tone, which compresses far better than music, so real albums take longer.

## FLAC

FLAC takes the same way since [#466](https://github.com/Koeroesi86/tunelle/issues/466), so what is heard no longer depends on the Chromium build of the system. The build has the `flac` and `ogg` demuxers, the `flac` decoder and parser (`ffmpeg-source.json`), so Ogg FLAC in an `.ogg` or `.oga` is decoded too. The depth of the file is kept (`toEncoder`): 16 bit FLAC gives `pcm_s16le`, 24 bit `pcm_s24le`. An embedded cover is a video stream and `-map 0:a:0` leaves it out of the WAV.

- Timing: a 10 minute stereo file of pink noise plus a tone, 44.1 kHz 16 bit (62 MB, the WAV is 106 MB), decoded in 0.14 s on a laptop, and one at 96 kHz 24 bit (136 MB, the WAV is 346 MB) in 0.19 s, so about 3000 to 4000 times faster than playing (warm file cache; a cold disk adds the time to read the file). The first play could wait for the whole decode; FLAC is served in windows anyway, like the other codecs with an exact length (see above), which also spares the wait on a cold disk and the disk space.
- Size: the WAV of a 24/96 file is about 2.5 times the FLAC (2 times for 16 bit CD material); it is not written to disk.
- Gapless: FLAC has no encoder delay or padding, so the decoded WAV has exactly the samples of the file (6 s fixtures give 6 s in `decoded-track.integration.test.ts`) and nothing is trimmed. The two tracks join without a gap as ALAC does.

## DSD

The 1 bit of a DSD file says nothing about the depth of the WAV, so a DSD file of any rate (DSD64, DSD128, DSD256) is decoded to 88.2 kHz and 24 bit (`-ar 88200 -c:a pcm_s24le`, set by `toEncoder` in `decoded-track.ts`). Chromium resamples to the rate of the device anyway, and 88.2 kHz is an exact 2:1 step to 44.1 kHz. A stereo file of 5 minutes is about 160 MB in the cache.

- Timing: a DSD64 stereo file of 5 minutes (211 MB) decoded in 0.7 s on a laptop, so DSD128 and DSD256 take a few seconds at most, and the first play does not need streaming.
- Level: the decoder adds no gain (a tone at 0.9 of full scale came out at -0.9 dB), so a master that peaks at 0 dBFS or above in the DSD can clip in the 24 bit WAV. No gain is applied by default.
- The library keeps the source format (codec `DSD`, 1 bit, the rate of the file), so the badge reads like `DSD 1/2822.4`.
- DSD in a WavPack file (`.wv`) is decoded the same way: ffmpeg gives 352.8 kHz PCM for DSD64, and the same `-ar 88200 -c:a pcm_s24le` brings it to the WAV of the other DSD files. It is stored as `DSD`, not `WAVPACK`, so it takes the whole decode.
- DST (compressed DSDIFF) is not decoded and stays out of the library (codec `DST`).
