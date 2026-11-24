Two tracks of 6 s each (a sine of 440 Hz and one of 880 Hz, mono, 44.1 kHz, 64 kbit/s) in the formats that have an encoder delay and padding, for `e2e/functional/gapless.spec.ts`. They were made with ffmpeg 7:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a libmp3lame -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Encoder Delay" -metadata track=1 mp3/1-concert-a.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a aac -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Priming" -metadata track=1 aac/1-concert-a.m4a
```

The second track is the same with 880 Hz, "Octave Up" and track 2. No real music or artist.

`flac/` has the same two tracks in FLAC (16 bit, mono, 44.1 kHz) in the album "Lossless FLAC", for `electron/protocols/decoded-track.integration.test.ts`, made with ffmpeg. `flac-hires/` has them at 24 bit and 96 kHz in the album "Lossless FLAC Hi-Res", each with an embedded cover (a 64x64 PNG), for the integration tests of the decoder proxy (the cover stream is not in the decoded WAV):

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a flac -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless FLAC" -metadata track=1 flac/1-concert-a.flac
ffmpeg -f lavfi -i "color=c=0x336699:s=64x64:d=1" -frames:v 1 cover.png
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=96000" -i cover.png -map 0:a -map 1:v -ac 1 -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 -c:v copy -disposition:v attached_pic -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless FLAC Hi-Res" -metadata track=1 flac-hires/1-concert-a.flac
```

The second tracks are the same with 880 Hz, "Octave Up" and track 2.

`alac/` has the same two tracks in ALAC (16 bit, mono, 44.1 kHz) in the album "Lossless Apple", for `e2e/functional/alac.spec.ts`, which plays them through the decoder proxy:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a alac -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless Apple" -metadata track=1 alac/1-concert-a.m4a
```

`vorbis/` has the same two tracks in Ogg Vorbis (mono, 44.1 kHz, 64 kbit/s) in the album "Lossy Vorbis", for `electron/protocols/decoded-track.integration.test.ts`, made with ffmpeg and libvorbis:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a libvorbis -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossy Vorbis" -metadata track=1 vorbis/1-concert-a.ogg
```

The second track is the same with 880 Hz, "Octave Up" and track 2.

`opus/` has the same two tracks in Opus (mono, 48 kHz, 48 kbit/s, in an Ogg `.opus`) in the album "Lossy Opus", for `electron/protocols/decoded-track.integration.test.ts`, made with ffmpeg and libopus:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=48000" -ac 1 -c:a libopus -b:a 48k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossy Opus" -metadata track=1 opus/1-concert-a.opus
```

The second track is the same with 880 Hz, "Octave Up" and track 2.

`mp2/` has the same two tracks in MP2 (mono, 44.1 kHz, 64 kbit/s) in the album "Lossy MP2", for `electron/protocols/decoded-track.integration.test.ts`. ffmpeg cannot write tags into a raw MP2 stream, so an ID3v2.3 tag (TIT2, TPE1, TPE2, TALB, TRCK) is put in front of the stream with a few lines of Node (one frame per tag, a synchsafe size in the 10 byte header):

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a mp2 -b:a 64k mp2/1-concert-a.mp2
```

The second track is the same with 880 Hz, "Octave Up" and track 2.

`ac3/` has the same two tracks in AC-3 (mono, 48 kHz, 96 kbit/s, in an `.m4a`) in the album "Lossy AC-3", for `electron/protocols/decoded-track.integration.test.ts`, made with ffmpeg and its native `ac3` encoder:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=48000" -ac 1 -c:a ac3 -b:a 96k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossy AC-3" -metadata track=1 ac3/1-concert-a.m4a
```

The second track is the same with 880 Hz, "Octave Up" and track 2.

`rf64/` and `w64/` have the same two tracks as 16 bit PCM (mono, 44.1 kHz) in an RF64 `.wav` (album "Lossless RF64", for `electron/protocols/decoded-track.integration.test.ts`) and in Wave64 `.w64` files, which have no tags (the muxer of ffmpeg writes none), for the integration tests of the decoder proxy:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le -rf64 always -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album="Lossless RF64" -metadata track=1 rf64/1-concert-a.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le w64/1-concert-a.w64
```

`caf/` (16 bit big-endian PCM) and `caf-alac/` (ALAC) have the same two tracks in Apple CAF `.caf` files (mono, 44.1 kHz, albums "Lossless CAF" and "Lossless CAF ALAC"), for `electron/protocols/decoded-track.integration.test.ts` (the first folder) and the integration tests of the decoder proxy:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16be -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album="Lossless CAF" -metadata track=1 caf/1-concert-a.caf
```

The ALAC ones use `-c:a alac`. The second tracks are the same with 880 Hz, "Octave Up" and track 2.

`mka/` has the same two tracks as FLAC in a Matroska `.mka` (mono, 48 kHz) in the album "Lossless Matroska", for `electron/protocols/decoded-track.integration.test.ts`:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=48000" -ac 1 -c:a flac -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless Matroska" -metadata track=1 mka/1-concert-a.mka
```

The second track is the same with 880 Hz, "Octave Up" and track 2.

`wav/` (16 bit PCM), `wav-float/` (32 bit float, and 64 bit float for the second track), `wav-adpcm/` (Microsoft ADPCM) and `wav-ima/` (IMA ADPCM) have the same two tracks in the albums "Lossless WAV", "Float WAV", "ADPCM WAV" and "IMA ADPCM WAV", for `electron/protocols/decoded-track.integration.test.ts` (the first folder) and the integration tests of the decoder proxy. Made with ffmpeg, the same command with the codec of the folder (`pcm_s16le`, `pcm_f32le` and `pcm_f64le`, `adpcm_ms`, `adpcm_ima_wav`):

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless WAV" -metadata track=1 wav/1-concert-a.wav
```

`ape/` has the same two tracks in Monkey's Audio (16 bit, mono, 44.1 kHz, normal compression) in the album "Lossless Monkey", for `electron/protocols/decoded-track.integration.test.ts`. They are made with the `mac` tool of the official SDK (<https://monkeysaudio.com/developers.html>) from WAV files that ffmpeg generates:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le 1-concert-a.wav
mac 1-concert-a.wav ape/1-concert-a.ape -c2000 -t "Title=Concert A|Artist=The Sine Waves|Album Artist=The Sine Waves|Album=Lossless Monkey|Track=1"
```

`dsd/` has the two tracks as DSD64 (1 bit, mono, 2.8224 MHz, 3 s), the first as DSF and the second as DFF, in the album "Lossless DSD", for `e2e/functional/dsd.spec.ts`. ffmpeg cannot encode DSD, so `scripts/tooling/generate-dsd-fixtures.ts` modulates the sines itself and writes both files with ID3 tags (the result is the same bytes each time):

```sh
npm run fixtures:dsd
```

`wavpack/` has the same two tracks in WavPack (16 bit, mono, 44.1 kHz, high compression) in the album "Lossless WavPack", for `electron/protocols/decoded-track.integration.test.ts`. They are made with `wavpack` of the official tools (<https://www.wavpack.com>) from the same WAV files:

```sh
wavpack -q -hh -w "Title=Concert A" -w "Artist=The Sine Waves" -w "Album Artist=The Sine Waves" -w "Album=Lossless WavPack" -w "Track=1" 1-concert-a.wav -o wavpack/1-concert-a.wv
```

`wavpack-dsd/` has the two tracks of `dsd/` as DSD64 in WavPack (1 bit, mono, 2.8224 MHz, 3 s) in the album "Lossless DSD WavPack", for `electron/protocols/decoded-track.integration.test.ts` and `decoded-loudness.integration.test.ts`. `wavpack` reads the DSF and the DFF file:

```sh
wavpack -q -hh -w "Title=Concert A" -w "Artist=The Sine Waves" -w "Album Artist=The Sine Waves" -w "Album=Lossless DSD WavPack" -w "Track=1" dsd/1-concert-a.dsf -o wavpack-dsd/1-concert-a.wv
wavpack -q -hh -w "Title=Octave Up" -w "Artist=The Sine Waves" -w "Album Artist=The Sine Waves" -w "Album=Lossless DSD WavPack" -w "Track=2" dsd/2-octave-up.dff -o wavpack-dsd/2-octave-up.wv
```

`aiff/` has the same two tracks in the album "Lossless AIFF" (16 bit, mono, 44.1 kHz) for `electron/protocols/decoded-track.integration.test.ts`: the first is an AIFF (big endian PCM), the second an AIFC with byte swapped PCM (`sowt`), made with ffmpeg:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16be -write_id3v2 1 -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless AIFF" -metadata track=1 aiff/1-concert-a.aiff
ffmpeg -f lavfi -i "sine=frequency=880:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le -f aiff -write_id3v2 1 -metadata title="Octave Up" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless AIFF" -metadata track=2 aiff/2-octave-up.aifc
```

`wma/` has the same two tracks in WMA (Windows Media Audio 2, mono, 44.1 kHz, 64 kbit/s) in the album "Windows Media", for `electron/protocols/decoded-track.integration.test.ts`, made with ffmpeg:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a wmav2 -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Windows Media" -metadata track=1 wma/1-concert-a.wma
```
