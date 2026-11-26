# The windowed decode and its speed

How a track is decoded a window at a time, and seeking in it. Part of [The decoder proxy](decoder-proxy.md).

## The windowed decode ([#563](https://github.com/Koeroesi86/tunelle/issues/563))

The codecs are ALAC, FLAC, APE, WavPack, AIFF, WAV and float WAV (`progressiveCodecs` in `electron/utils/is-supported.ts`), up to two channels. `ffprobe` (`probe-audio.ts`) gives the channels, the rate and the frames, only when the time base of the stream is one frame (`1/<rate>`). An answer that rules the windows out (more channels, no exact length) is kept until the app quits, as each range of such a track asked `ffprobe` again ([#576](https://github.com/Koeroesi86/tunelle/issues/576)); a probe that failed is tried again. The header of the WAV (`wav-header.ts`, [RF64 above 4 GiB](decoder-formats.md#over-4-gib-rf64)) and its size are therefore known before anything is decoded, and a request for the header alone starts no decode.

A window (`decode-window.ts`) starts with an ffmpeg run from the frame of the read that opened it (`-ss <frame / rate>` before `-i`, nine decimals), writing raw samples (the `s16le`, `s24le`, `s32le` and `f32le` muxers) to a pipe. The app takes from the pipe until it is the reach of the window ahead of the read, then stops taking, and ffmpeg waits on the full pipe. Bytes further behind the read than the reach are let go. `windowed-track.ts` picks a window for each read, and opens one when none can serve it:

- A read inside a window uses it: Chromium's re-reads and overlapping ranges start no new decode.
- A read outside every window (a seek) starts a new decode at its offset. The old window stays, so a seek back to it costs nothing while it is open.
- Readers share a window while they are close. One that runs more than the reach ahead of another gets its own decode, so a paused player keeps its window: the loudness measurement, which reads the whole track, splits off once.
- A full window that no read moves for 10 s stops its ffmpeg (`restAfterMs`), so the source file is not held open while the player is paused. The decoded bytes stay. When a read comes within half of the reach of their end, a new ffmpeg starts at the frame there and the window goes on from the first byte that it does not hold.
- A window that has an open reader is kept however long that reader waits (a paused player does not read, and its request may stay open). One without a reader is dropped after 5 minutes, and a later request decodes again.
- The preloaded next track opens a window, decodes it and waits there, without its ffmpeg after 10 s.
- Windows do not take the two places of the whole decodes, as most of their time is spent waiting for the reader.
- A decode that gives another number of bytes than the file said, or an ffmpeg of a window that exits with an error before the last byte (not one that the app stopped), is logged, and that track uses the whole decode from then on (until the app restarts). The player loads a track whose answer failed once more, which takes the whole decode; until [#583](https://github.com/Koeroesi86/tunelle/issues/583) the reload opened another window, and the track was skipped. No file is known for which the whole decode does better, and one that fails whole too answers as in [The route](decoder-proxy.md#the-route).
- ALAC in CAF takes the whole decode from the start: `ffprobe` says 264600 frames of the fixture and the decode gives 262960 (`probe-audio.ts` gives no length for it, by the codec and the container of the file).
- A decode that fails ends the read, without being started again for it. The body of the answer [fails](#a-stream-that-ends-early), and the next request of the track takes the whole decode.

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
