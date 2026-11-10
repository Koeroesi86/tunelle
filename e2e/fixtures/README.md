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
