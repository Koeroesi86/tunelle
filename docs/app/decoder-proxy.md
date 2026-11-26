# The decoder proxy

Part of [#302](https://github.com/Koeroesi86/tunelle/issues/302). Chromium plays the audio of the app, so a format it cannot decode is decoded by the bundled ffmpeg ([ffmpeg-build.md](../development/ffmpeg-build.md)) to a WAV, and the `/track` route serves that WAV. The address the renderer asks for does not change, so the `<audio>` elements, the Web Audio graph, gapless playback and the rest stay as they are. Only the codecs in `decodedCodecs` of `electron/utils/is-supported.ts` take this way: Opus (`.opus`), MP3 (`.mp3`), MP2 (`.mp2`), AC-3 (in an `.m4a`), Matroska and WebM audio (`.mka`, `.weba`; FLAC, Opus and Vorbis in them), CAF (`.caf`; PCM, ALAC, A-law and µ-law in it), WAV (`.wav`, also RF64, and Wave64 `.w64`; every PCM, float, ADPCM, A-law and µ-law variant), Ogg Vorbis (`.ogg`, `.oga`), FLAC (`.flac`, and Ogg FLAC in an `.ogg` or `.oga`), ALAC (in an `.m4a`), Monkey's Audio (`.ape`), WavPack (`.wv`, also DSD in it) AIFF (`.aiff`, `.aif`) with AIFC (`.aifc`) DSD (`.dsf`, `.dff`), DST compressed DSD (`.dff`) and WMA (`.wma`, `.asf`), told apart by the `codec` the scan read.

## The route

`/track` looks the path up in the library (`findPlayableTrack`: path, codec, bit depth) and serves it in one of two ways, both with the size and the ranges of the whole WAV, so seeking works as for any other track:

- a codec with an exact length is decoded in **windows in memory** where it is read (`windowedTrack`, `serveWindowed`), and nothing is written to disk;
- any other file goes to `playableFile` (`electron/protocols/decoded-track.ts`), which gives the file itself or a copy that is decoded whole into the cache, and `serveFile` answers it.

A whole decode that fails, or whose request is gone, answers 404, and the player skips the track as for a file it cannot open, after it has tried once more (see [A stream that ends early](#a-stream-that-ends-early)). Its first play waits for the whole decode, and the page gets the answer after that.

## The windowed decode ([#563](https://github.com/Koeroesi86/tunelle/issues/563))

The codecs are ALAC, FLAC, APE, WavPack, AIFF, WAV and float WAV (`progressiveCodecs` in `electron/utils/is-supported.ts`), up to two channels. `ffprobe` (`probe-audio.ts`) gives the channels, the rate and the frames, only when the time base of the stream is one frame (`1/<rate>`). An answer that rules the windows out (more channels, no exact length) is kept until the app quits, as each range of such a track asked `ffprobe` again ([#576](https://github.com/Koeroesi86/tunelle/issues/576)); a probe that failed is tried again. The header of the WAV (`wav-header.ts`, [RF64 above 4 GiB](#over-4-gib-rf64)) and its size are therefore known before anything is decoded, and a request for the header alone starts no decode.

A window (`decode-window.ts`) starts with an ffmpeg run from the frame of the read that opened it (`-ss <frame / rate>` before `-i`, nine decimals), writing raw samples (the `s16le`, `s24le`, `s32le` and `f32le` muxers) to a pipe. The app takes from the pipe until it is the reach of the window ahead of the read, then stops taking, and ffmpeg waits on the full pipe. Bytes further behind the read than the reach are let go. `windowed-track.ts` picks a window for each read, and opens one when none can serve it:

- A read inside a window uses it: Chromium's re-reads and overlapping ranges start no new decode.
- A read outside every window (a seek) starts a new decode at its offset. The old window stays, so a seek back to it costs nothing while it is open.
- Readers share a window while they are close. One that runs more than the reach ahead of another gets its own decode, so a paused player keeps its window: the loudness measurement, which reads the whole track, splits off once.
- A full window that no read moves for 10 s stops its ffmpeg (`restAfterMs`), so the source file is not held open while the player is paused. The decoded bytes stay. When a read comes within half of the reach of their end, a new ffmpeg starts at the frame there and the window goes on from the first byte that it does not hold.
- A window that has an open reader is kept however long that reader waits (a paused player does not read, and its request may stay open). One without a reader is dropped after 5 minutes, and a later request decodes again.
- The preloaded next track opens a window, decodes it and waits there, without its ffmpeg after 10 s.
- Windows do not take the two places of the whole decodes, as most of their time is spent waiting for the reader.
- A decode that gives another number of bytes than the file said is logged, and that track uses the whole decode from then on (until the app restarts).
- ALAC in CAF takes the whole decode from the start: `ffprobe` says 264600 frames of the fixture and the decode gives 262960 (`probe-audio.ts` gives no length for it, by the codec and the container of the file).
- A decode that fails ends the read, without being started again for it; a later request tries again. The body of the answer [fails](#a-stream-that-ends-early).

Not tested: Windows and macOS in the real app, and whether a sleeping disk wakes within the half of the reach that is left when ffmpeg starts again.

### A stream that ends early

A read that ends before the end of its range, while its request is still wanted, errors the body (`serve-windowed.ts`). Until [#576](https://github.com/Koeroesi86/tunelle/issues/576) the body was closed, and a failed decode looked like a whole answer: `fetch` resolved with fewer bytes than `Content-Length` said, so the loudness measurement could measure a part of a track. Now its read fails, which counts as unreadable and is tried again later.

What `<audio>` does with it, measured in a throwaway app on Linux (Electron 45, a 60 s WAV on a privileged scheme, cut after 10 s):

| body | what Chromium does |
| --- | --- |
| errors once | asks for the range again from the bytes it has, and plays on, with no `error` event |
| always errors | stalls, asks about 30 times in 28 s, then `error` (code 2) with `currentTime` kept |
| always closes short | asks about 30 times at once, `error` within a second |

On an `error` of the file that plays, `AudioComponent` loads it once more at the same position, and moves on when that fails too, so a file that can never be decoded takes about a minute to be passed over when it breaks midway, and no time when it answers 404. To check it, serve a body that calls `controller.error()` from a `protocol.handle` and log the requests and the events of the element.

### Why 10 s until ffmpeg is stopped

Chromium does not read a playing track evenly: it asks for about 1.1 MB at once and then waits until that has played. Measured on Linux, by logging every read of a window while generated FLAC files played:

| file | bytes of samples a second | time between reads |
| --- | --- | --- |
| 22.05 kHz mono 16 bit | 44 KB | 20 to 26 s |
| 44.1 kHz stereo 16 bit | 176 KB | 6 to 7 s |
| 96 kHz stereo 32 bit | 768 KB | 1.9 s |
| 192 kHz stereo 32 bit | 1.5 MB | 1 s |

With 3 s, ffmpeg was stopped and started again between every two reads of a CD quality track. With 10 s it runs through at that rate and above; a track of less than about 110 KB a second still has a new ffmpeg between its reads. A paused player sends no read, so the file is let go 10 s after the pause. To check it on Linux: play and pause a long track and look for the file under `/proc/*/fd`.

### An open source file on Windows

Symptom: on `windows-2025` the end to end tests that use the `music` fixture failed with `EPERM, Permission denied` on removing the music folder, after their assertions had passed. Cause: the folder was removed while the app still ran, and a window that had not reached the end of its track kept ffmpeg, which holds the file open (an inference from the error and the order of the fixtures). Windows does not remove such a file; a user of the app would likely be refused too (not tried). Two changes: a waiting ffmpeg is stopped (see above), and the fixture removes the folder after the app has quit, as a playing track may be open. While a track plays, its file can still be held.

## How much is decoded: the speed of the source

Constants are in `electron/protocols/decode-policy.ts`, the measurement in `source-speed.ts`. `prepareDecode` opens the file and reads its first 256 KiB once per volume (`stat.dev`), and keeps the result until the app restarts; the open and the read together that take over 50 ms (about 5 MB/s) makes the volume **slow**, anything else **fast**, and a file that cannot be read counts as slow.

| | fast source | slow source |
| --- | --- | --- |
| window ahead of a read | 5 s of audio | 10 s of audio |
| window behind a read | 4 MiB | 4 MiB |

- There are at most 6 windows, and each may hold its share of 128 MiB. Only a rate above about 1.8 MB/s on a slow source (3.6 MB/s on a fast one) gets fewer seconds ahead than the table says: 192 kHz stereo at 32 bit is 1.5 MB/s. Each window has its own share, so windows only drop each other for their number, never for room: with one shared budget two busy readers could drop each other's window in turn without end. A window with no reader goes first, then the one used longest ago, and a reader whose window was dropped goes on in a new one.
- Measured on a laptop (NVMe, btrfs): the read of 256 KiB takes 0.2 to 0.3 ms with the file in the page cache. The 50 ms threshold is a margin of 200 times over that and was **not** measured on a network mount, a USB disk or a sleeping spinning disk; a cold NVMe read is expected in the low milliseconds. Move `slowAfterMs` when such a source is measured.
- The speed decides only the reach of a window; the cache of the whole decodes has one limit (see The cache).

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

Monkey's Audio seeks by the seek table at the start of the file and does not scan it. Time until the first bytes and bytes read from the file (`Statistics:` in the `-v verbose` log of ffmpeg), for 16 bit mono 44.1 kHz at the normal level, at positions from the start to the last sample, same laptop:

| length | file | first bytes | bytes read per seek |
| --- | --- | --- | --- |
| 1003 s | 12.5 MB | 2 to 5 ms | 87 to 295 KB |
| 6019 s | 75 MB | 2 to 5 ms | 120 to 328 KB |

- Every position gave the same bytes as the decode from the start, including one sample before, at and after a frame edge.
- ffmpeg cannot encode Monkey's Audio, so these files were made by repeating the full frames of the two fixtures in `e2e/fixtures/ape/` with a new header and seek table. A frame counts its 32 bit words from the first frame: copy the whole words that hold it and keep its start modulo 4 in the seek table. The whole decode of the file made this way equals the decoded frames of the fixtures. To measure again, make such a file (or take a long real one) and run `ffmpeg -v verbose -ss <seconds> -i <file> -frames:a 1 -f s16le -`.
- A seek decodes from the start of its frame. The frames measured here are 73728 samples long; a file at a higher level has longer ones, so a seek there decodes more before the first byte. That was **not** measured.

No codec was measured on a slow drive.

## The whole decode

`ffmpeg -nostdin -v error -fflags +bitexact -i <file> -map 0:a:0 -map_metadata -1 -c:a <pcm> -rf64 auto -f wav -y <cache>/<key>.wav.<uuid>.part`. The sample rate and the channels stay as in the file (the audio context resamples), the samples as in [Depth and float samples](#depth-and-float-samples). The output is written as `.part` and renamed when ffmpeg ends well, so a file of the cache is whole. A failure removes the `.part` file and logs the error of ffmpeg. Every decode has a `.part` name of its own (see [Cancel and retry](#cancel-and-retry)).

- The program is `ffmpeg/ffmpeg` of the resources of the packaged app, and `.cache/ffmpeg/install/bin/ffmpeg` (`npm run ffmpeg`) next to `out/` otherwise.
- Requests for the same track meanwhile share one decode. It is killed when the last request waiting for it is aborted (the page leaves the track, see [tunelle-protocol.md](tunelle-protocol.md#when-the-page-lets-a-request-go)), and not before.
- When the app quits (`will-quit`, `stopDecodes`), the running decodes are killed and the waiting ones are dropped. Node does not end a child with its parent, so an ffmpeg that writes a file went on after the app ([#576](https://github.com/Koeroesi86/tunelle/issues/576)); one that writes to a pipe, as of a window or a station, loses its reader. Not at `before-quit`: the windows still close then, and the playing track may wait for its decode.
- At most two decodes run at the same time, the others wait for a place. A place that gets free goes to the decode of the oldest request of the player that still waits, and to the loudness measurement only when none of the player waits. The player asks for the track that plays and then for the next one, and a skipped request is aborted and no longer counts, so the oldest live one is the current track, also when it was the preload before ([#583](https://github.com/Koeroesi86/tunelle/issues/583): with the newest first, the preload was decoded first and the current track waited for its whole decode). The place of a request is taken when it arrives (`arrivalOf`), before the lookup of the track or the download of a server track, which may end in another order. The measurement marks its requests with `measure` in the address (`client/loudness/measure-track.ts`); a decode that both wait for counts as the player's as long as a request of the player does. A running decode is not stopped for one that waits.

### Cancel and retry

A cancelled decode or download ends later than its cancel (ffmpeg has to close, a stream has to fail), and a new request for the same track can start in between ([#576](https://github.com/Koeroesi86/tunelle/issues/576)). Symptom: the retry answered 404, because both wrote to one `.part` file and the cancelled job removed it when it closed. So:

- Each decode job and each download writes to a `.part` file with a random name of its own.
- A cancelled one never renames its file into the cache, even when ffmpeg or the download ended well, and a decode cancelled while its folder is made does not start ffmpeg.
- A cancelled one leaves the map of the running ones at once, so a new request does not join it, and its late end does not remove the entry of the new one.
- A request that is aborted while the app looks at the file or the cache is checked once more right before it is counted, as a signal that has aborted never calls a listener that is added later.

A `.part` file of a quit or a crash stays: the decode cache removes it like any old file, and the download folder removes the ones of no running download after the next download. The tests are `decoded-track.test.ts` and `source-download.test.ts`; `request-aborts.test.ts` and `e2e/functional/skip.spec.ts` check that the abort of the page arrives.

## Depth and float samples

`toEncoder` (`pcm-encoder.ts`) picks the samples of the WAV, for the windowed and the whole decode and for a radio station:

- An integer file keeps its depth: 16 bit or less is `pcm_s16le`, up to 24 `pcm_s24le`, above `pcm_s32le`, and 16 when the depth is not known.
- Lossy (MP3, MP2, Opus, Vorbis, AC-3, WMA) and float audio is `pcm_f32le`. Its samples can go over full scale, and an integer WAV clipped them before ReplayGain could turn them down ([#576](https://github.com/Koeroesi86/tunelle/issues/576)). WMA Lossless shares the name `WMA`; a float holds its 24 bit exactly. ADPCM, A-law and µ-law decode to integers and stay 16 bit. A 64 bit float file loses what a 32 bit float can not hold, as the audio context would.
- WavPack, AIFF-C and CAF hold integers or floats, both with a depth of 32 in the library, so `ffprobe` is asked for a file of that depth, once for each file.
- DSD and DST have their own format (see [DSD](#dsd)).

The windowed WAV has the 44 byte header with the format 3 (IEEE float) and no `fact` chunk. Measured on Linux in the built app, a float WAV with a sine of 1.5 of full scale kept that peak through `<audio>` into Web Audio and through `decodeAudioData`.

## Over 4 GiB (RF64)

The sizes in a WAV header are 32 bit, which 2 h 15 min of a decoded DSD file (88.2 kHz, 24 bit, stereo) pass ([#576](https://github.com/Koeroesi86/tunelle/issues/576): the windowed decode failed on writing the header, and the whole decode cached a wrong one). A larger WAV is [RF64](https://tech.ebu.ch/docs/tech/tech3306v1_0.pdf): `RF64` instead of `RIFF`, the sizes as `0xFFFFFFFF`, and the 64 bit ones in a `ds64` chunk first. `wavHeader` writes 80 bytes for it instead of 44, and the whole decode asks ffmpeg for it with `-rf64 auto`, which leaves a smaller file a RIFF file with a `JUNK` chunk of 36 bytes. The loudness slicer reads the length of the sound from `ds64`.

Measured on Linux in a throwaway Electron 45 app: `<audio>` plays and `decodeAudioData` decodes small RF64 files; a file of 4.59 GB (a sparse one with a header like ours, and one that the bundled ffmpeg wrote with `-rf64 auto`) had its duration of 13000 s and played after a seek past 4 GiB. Not measured: Windows and macOS, and the real app with such a track. To measure again, write the header, `ftruncate` the file to its size, and serve it with ranges.

## Radio stations and server tracks ([#562](https://github.com/Koeroesi86/tunelle/issues/562))

The same rule holds for the online sources: a format in `decodedCodecs` is decoded by the bundled ffmpeg, Chromium plays the rest.

- **Radio** (`radio-proxy.ts`, `stream-decode.ts`): the ICY metadata is stripped first, then the start of the stream (up to 64 KiB or 2 s, `peekStream`) is read until `detectStreamCodec` names the codec (MP3 and ADTS AAC by two frames in a row, Opus, Vorbis and FLAC in Ogg by the header of the codec, native FLAC by `fLaC`), and for FLAC until the depth of its `STREAMINFO` block has arrived (`stream-format.ts`), so a 24 bit station stays 24 bit. A codec of `decodedCodecs` goes to `ffmpeg -i pipe:0 ... -f wav pipe:1` and the response is `audio/wav` of no set length; nothing is written to disk. The sample rate comes from the header of the decoded WAV. AAC (no decoder in the build, see [#549](https://github.com/Koeroesi86/tunelle/issues/549)) and a stream whose format is not named take the old path, Chromium decodes the bytes. If ffmpeg cannot start, or ends before it gave a byte (a build without the MP3 decoder, as the Flatpak), the stream plays in Chromium as before: the bytes that were read are replayed (`replay`), the few that ffmpeg took before it failed are lost, and Chromium finds the next frame. Closing the response kills ffmpeg and closes the connection to the station, and a request that the page lets go while the start of the stream is read starts no ffmpeg.
- A station that drops: symptom, the request and its ffmpeg stayed for ever when the connection broke while the start of the stream was read ([#576](https://github.com/Koeroesi86/tunelle/issues/576)). Cause: `pipe` never ends the destination for a source that is destroyed or errored, and an `error` listener added afterwards hears nothing, so ffmpeg waited for its input. `decodeStream` watches the input with `finished`, which also tells of a stream that broke before the call, and kills ffmpeg; an input that ends normally lets ffmpeg finish. To check: destroy the input before the call (`stream-decode.test.ts`).
- **Server tracks** (`source-protocol.ts`, `source-download.ts`): the page adds the `codec` that the server's metadata gave (`track-source.ts`), as the server's stream has no codec before it is read. The name only decides whether to download: a codec of `decodedCodecs`, or a container that can hold one or another codec (MP4 as `m4a`, Matroska and WebM). It is downloaded whole to the `source` [cache folder](#folders) (once for the requests that ask meanwhile, the three files that were asked for last and the [files in use](#files-in-use) stay, the download stops when the last request leaves, see [Cancel and retry](#cancel-and-retry)). `ffprobe` then gives the codec and the depth of the file (`source-format.ts`, once for each file), and it goes the way of a library file: the windowed or the whole decode, or the file as it is (AAC, or a file that `ffprobe` can not read). A pipe cannot be sought, and an MP4 with its `moov` at the end cannot be read from one, so a track is not streamed through ffmpeg; the cost is that it starts when the download is done (on the local network a lossless track takes some seconds), now also for an AAC track in an `m4a` of Subsonic or Jellyfin. A failed download plays the server's own stream; a failed decode answers 404, except for MP3.
- The downloaded file is named `.src`, so a file served as it is has the type of that suffix (`application/x-wais-source`). Chromium reads the content: an AAC track played so in the built app on Linux.
- Symptom of [#576](https://github.com/Koeroesi86/tunelle/issues/576): ALAC, APE, WavPack, DSD and AIFF tracks of a server were not decoded, and 24 bit tracks were cut to 16. Cause: the three clients passed their suffix, container or codec in capitals (`APE`, `WV`, `M4A`), which are not the names of the library, and no depth. `toCodecName` (`electron/utils/codec-name.ts`) now gives those names for all of them and for what `ffprobe` says.
- Not built: restarting a stream at an offset for a range request, and a measured start-up delay of ffmpeg for an MP3 station. `stream-decode.integration.test.ts` runs the real ffmpeg on the fixtures through `serveRadio` and `serveSource`. Whether Chromium plays a WAV of unknown length from `<audio>` without trouble is not measured in `e2e/` yet.

## The cache

Only whole decodes and the downloads of server tracks are written to disk. The whole decodes go to the `whole-decodes` [cache folder](#folders); playing an album of a progressive codec adds nothing to it (`windowed-track.integration.test.ts` and `windowed-track.test.ts` check that). A whole decode takes rate × channels × bytes per sample × seconds; lossy audio, in float, takes twice the room of 16 bit (5 minutes of 44.1 kHz stereo are 106 MB), so about 19 such tracks fit. The key is a hash of the path, the size and modification time of the source and the output format, so a changed file is decoded again and the old copy is evicted with time. A copy that is served gets its modification time set to now.

After each decode the oldest files are removed until the cache is under 2 GiB, whatever the speed of the source (45 minutes of DSD fit, so an album is not decoded again when it is played again), except the [files in use](#files-in-use), the files (and `.part` files) of a running decode and the three that the player asked for last: the track that plays, the preloaded next one (`upNext`, whose request starts the decode early so the hand-off stays gapless) and the previous one. The requests of the loudness measurement and the windowed decodes, which write no file, do not count among them. Stale `.part` files go the same way.

### Folders

Both caches are in `tunelle-<user id>` of the temp folder of the system (`tunelle-user` on Windows, which has a temp folder for each user), made with the mode 0700 (`cache-folder.ts`). Before a file is read or written, the folder has to be a folder of this user and no link: all users of a Linux system share `/tmp`, so another one could put a folder with files of their own at a name that is known ([#576](https://github.com/Koeroesi86/tunelle/issues/576)). One that fails the check is not used: the error is logged, a track that needs the whole decode answers 404 (MP3 and the other codecs that Chromium plays are served as they are), and a server track plays as the server sends it. Where `/tmp` is a tmpfs, the caches are still in RAM.

Earlier versions used `tunelle-decoded`, `tunelle-whole-decodes` and `tunelle-source` for all users. The app removes them when it starts (`removeOldCache`), as the limits only run after a whole decode or a download, which some libraries never start; the folder of another user stays, with an error in the log.

### Files in use

A file that is being read is not removed by either cache (`held-files.ts`): a request holds the decoded copy or the downloaded track until the body of its answer has ended, failed or been cancelled, and a decode window holds its source until it is dropped, as it starts ffmpeg on the file again when it decodes on. So a cache can be over its limit for a while.

A download that is asked for again counts as new, so the track that plays is not the oldest one after others were preloaded. That time is kept in memory: the modification time of a downloaded file is part of the key of its decoded copy, and changing it would decode the track again every time. After a restart the files count by their modification times.

### Measured after playing an album

The built app on Linux, one folder added and played at a time to the end of each track (by a seek near the end), with `TMPDIR` set to an empty folder. The sizes include what the loudness measurement decodes.

| played, in this order | files in the cache | bytes in the cache |
| --- | --- | --- |
| 5 tracks of 60 s: FLAC, ALAC, WavPack, AIFF, WAV (with two APE tracks of a few seconds in the library) | the folder was not made | 0 |
| then 9 tracks of 300 s of WMA, 44.1 kHz stereo, decoded to 16 bit when measured (float, twice the size, since [#576](https://github.com/Koeroesi86/tunelle/issues/576)) | 9 | 476,209,854 |
| then 9 tracks of 300 s of DSD64 stereo (generated silence) | 18 | 1,905,050,772, of which DSD 1,428,840,918 |

A folder of an earlier version (`tunelle-decoded`) put there before the start was gone after it. To measure again: a temporary spec that starts the app with `start({ env: { TMPDIR } })` and adds the folders one by one (with all of them in the library at once, the loudness measurement decodes the WMA and DSD tracks while the first album plays).

## Tests

`windowed-track.test.ts` runs the windows with a fake ffmpeg (the reach of a fast and of a slow source, a seek, a re-read, a paused reader, a second reader, the number and memory limits, a wrong length and a failure), `serve-windowed.test.ts` their ranges, `codec-name.test.ts`, `source-format.test.ts`, `stream-format.test.ts` and the rows of `probe-audio.test.ts` the formats (with the real ffmpeg in `stream-decode.integration.test.ts`), `decode-policy.test.ts` and `source-speed.test.ts` (a fake source that answers late, or opens late) the policy, and `windowed-track.integration.test.ts` compares, with the real ffmpeg, the bytes from several offsets with the whole decode for every progressive codec. `decoded-track.limits.test.ts` covers the cache limit and what it spares, `cache-folder.test.ts` the folders and the removal of the old ones, `held-files.test.ts` the files in use. `decoded-track.test.ts` runs the cache, the sharing, the abort, the limit and the eviction with a fake child process; `tunelle-protocol.test.ts` the route; `e2e/functional/alac.spec.ts` plays the ALAC fixture (`e2e/fixtures/alac/`) with the real ffmpeg and measures the tone that leaves the app, which shows that Chromium plays what the decoder proxy serves; `e2e/functional/wav.spec.ts` plays the WAV fixture the same way; `e2e/functional/vorbis.spec.ts` does the same for Ogg Vorbis; `e2e/functional/dsd.spec.ts` does the same for DSD and also measures the loudness, as it is the one that is 24 bit at 88.2 kHz. The other formats (Monkey's Audio, WavPack, AIFF, WMA) go through the same route and are not played in `e2e/`. `electron/protocols/decoded-track.integration.test.ts` and `decoded-loudness.integration.test.ts` scan the fixtures of all the formats and check the decoded WAV of each: the tone and the length, and the loudness that the code of `client/loudness/` gives it against an ideal sine (docs/development/integration-tests.md).

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
- DST (compressed DSDIFF, from some SACD rips) is decoded the same way by the `dst` decoder, to the same WAV. It is stored as codec `DST` with 1 bit and takes the whole decode. The Flatpak build has no `dst` decoder ([ffmpeg-build.md](../development/ffmpeg-build.md)), so there a DST file is listed and does not play.
- ffmpeg 9.0.2 gets an uncompressed DST frame (first bit 0) wrong: `dstdec.c` copies its bytes next to each other and then reads every fourth one, so the frame decodes to noise. Compressed frames, which are what a DST file is made of, are right. A test fixture therefore needs coded frames: `scripts/tooling/dst-frame.ts` writes them, and the integration test compares the decode byte for byte with the one of the same DSD.
