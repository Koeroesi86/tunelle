Two tracks of 6 s each (a sine of 440 Hz and one of 880 Hz, mono, 44.1 kHz, 64 kbit/s) in the formats that have an encoder delay and padding, for `e2e/gapless.spec.ts`. They were made with ffmpeg 7:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a libmp3lame -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Encoder Delay" -metadata track=1 mp3/1-concert-a.mp3
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a aac -b:a 64k -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Priming" -metadata track=1 aac/1-concert-a.m4a
```

The second track is the same with 880 Hz, "Octave Up" and track 2. No real music or artist.

`alac/` has the same two tracks in ALAC (16 bit, mono, 44.1 kHz) in the album "Lossless Apple", for `e2e/alac.spec.ts`, which plays them through the decoder proxy:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a alac -metadata title="Concert A" -metadata artist="The Sine Waves" -metadata album_artist="The Sine Waves" -metadata album="Lossless Apple" -metadata track=1 alac/1-concert-a.m4a
```

`ape/` has the same two tracks in Monkey's Audio (16 bit, mono, 44.1 kHz, normal compression) in the album "Lossless Monkey", for `e2e/ape.spec.ts`. They are made with the `mac` tool of the official SDK (<https://monkeysaudio.com/developers.html>) from WAV files that ffmpeg generates:

```sh
ffmpeg -f lavfi -i "sine=frequency=440:duration=6:sample_rate=44100" -ac 1 -c:a pcm_s16le 1-concert-a.wav
mac 1-concert-a.wav ape/1-concert-a.ape -c2000 -t "Title=Concert A|Artist=The Sine Waves|Album Artist=The Sine Waves|Album=Lossless Monkey|Track=1"
```

`wavpack/` has the same two tracks in WavPack (16 bit, mono, 44.1 kHz, high compression) in the album "Lossless WavPack", for `e2e/wavpack.spec.ts`. They are made with `wavpack` of the official tools (<https://www.wavpack.com>) from the same WAV files:

```sh
wavpack -q -hh -w "Title=Concert A" -w "Artist=The Sine Waves" -w "Album Artist=The Sine Waves" -w "Album=Lossless WavPack" -w "Track=1" 1-concert-a.wav -o wavpack/1-concert-a.wv
```
