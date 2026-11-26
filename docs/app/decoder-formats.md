# Sample formats of the decoder

Depth, float samples, files over 4 GiB, FLAC and DSD. Part of [The decoder proxy](decoder-proxy.md).

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

## FLAC

FLAC takes the same way since [#466](https://github.com/Koeroesi86/tunelle/issues/466), so what is heard no longer depends on the Chromium build of the system. The build has the `flac` and `ogg` demuxers, the `flac` decoder and parser (`ffmpeg-source.json`), so Ogg FLAC in an `.ogg` or `.oga` is decoded too. The depth of the file is kept (`toEncoder`): 16 bit FLAC gives `pcm_s16le`, 24 bit `pcm_s24le`. An embedded cover is a video stream and `-map 0:a:0` leaves it out of the WAV.

- Timing: a 10 minute stereo file of pink noise plus a tone, 44.1 kHz 16 bit (62 MB, the WAV is 106 MB), decoded in 0.14 s on a laptop, and one at 96 kHz 24 bit (136 MB, the WAV is 346 MB) in 0.19 s, so about 3000 to 4000 times faster than playing (warm file cache; a cold disk adds the time to read the file). The first play could wait for the whole decode; FLAC is served in windows anyway, like the other codecs with an exact length (see [the windowed decode](decoder-windowed.md)), which also spares the wait on a cold disk and the disk space.
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
