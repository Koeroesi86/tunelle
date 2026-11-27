# The audio context and the sample rate

`client/audio/context.ts` owns the one `AudioContext` of the player. Every element plays through `createMediaElementSource` into an input gain, the equalizer and the destination.

## Why the app does not force a rate

`audioContext.sampleRate` is read-only and the output stream of Chromium opens at the default rate of the device, so `new AudioContext({ sampleRate: trackRate })` only adds a resample between the context and the device. There is no web API that sets the rate of the device; that needs a native output path (issue #287). The app reads the rate of the device and never asks for one. A rate of the OS (Windows Sound settings, macOS Audio MIDI Setup, PipeWire `allowed-rates`) is the listener's to set.

## What the app does

- **Resamples are shown.** `LoudnessPanel` on the now playing page has a line with the rate of the file (`Track.sampleRate`) and the rate of the context. The same rate shows `96 kHz Native`, a different one `44.1 → 48 kHz Resampled`, and a track with no known rate shows nothing.
- **The context follows the device.** `setOutputDevice` opens a context for the device (`new AudioContext({ sinkId })`, no `sampleRate`) and compares its rate with the current one. At the same rate it is closed and `setSinkId` moves the sound, as before. At another rate it replaces the current context, so the sound is not resampled a second time between the context and the device. A device that cannot be opened gives a context on the default device. Switches wait for each other, as the list of devices changes in bursts.
- **A replaced context is made again.** An element can be wrapped by one context only, so `replaceContext` pauses the old elements (the status of the player ignores them), makes a new input gain, forgets the wrapped elements, the normalizers and the analyser, closes the old context and tells the listeners (`addOutputChangeListener`) the position and whether the track played. `AudioComponent` then remounts its two `<audio>` elements (the `key` has the generation), connects them, loads the current source, sets the position and plays if it played; a station continues live. The equalizer builds a new filter chain when the first element is wrapped (`onAudioMounted` calls its listeners again), and the spectrum asks for the analyser of the context on each frame. The track that follows is loaded into the standby element again.
- **A short gap is expected** at the switch: the sound is paused until the new elements play.
- **The default device is followed.** A context that plays on the default device listens to `sinkchange`. When the default changes it opens a context for the new default, and replaces the current one if the rates differ (a device that was picked is left alone). The two kinds of switch share a queue.

## A channel that goes silent ([#591](https://github.com/Koeroesi86/tunelle/issues/591))

- **Symptom:** one channel, say the right one, falls silent while the other plays on, and stays silent on the following tracks until the app is restarted (or the context is replaced).
- **Cause:** a filter of the equalizer keeps a memory of the samples of each channel. One sample that is `NaN` or `Infinity` stays in that memory, so all that the filter gives for that channel from then on is `NaN`, which is played as silence. The filters are in the graph also when the equalizer is flat. A float WAV can hold such a sample, as neither the decoder nor Chromium takes it out (the `OverscaleGuard` of a [decoded stream](decoder-sources.md) does, for its own audio only).
- **Fix:** `connectDestination` hangs a small analyser behind the last filter. At each `timeupdate` of the element that plays, `repairOutput` reads it (the analyser mixes the channels, so a `NaN` in either shows), and when a value is not a finite number it disconnects the filters and calls the listeners of `onAudioMounted` again, which makes new ones. The channel is silent for a quarter of a second or so. It is logged as `the filters give no sound, they are made again` with the source of the track.
- **Check:** `e2e/functional/damaged-audio.spec.ts` plays a float WAV with one `NaN` in the right channel and listens to that channel.

What gave the sample in the report of #591 (macOS) is not known: the file or station that played was not named.

## The rate of a radio station

A station has no file, so no rate in the library. The proxy of the stream (`electron/protocols/radio-proxy.ts`) passes the audio through a `SampleRateTap`, which keeps the first 64 KiB until `detectStreamSampleRate` (`shared/utils/stream-sample-rate.ts`) finds a rate and then lets the rest go by untouched. It reads MP3 and AAC (ADTS) from two frame headers in a row, since the sync pattern of one frame can be in the data by chance, Opus as 48 kHz and Vorbis from its header; a stream of another kind has no rate and shows none. The main process sends it as `RADIO_STREAM_RATE`, the state keeps it as `streamSampleRate` for the station that plays (forgotten when another track starts), and the now playing page shows it in the same line as a file's rate, `LoudnessPanel` with no `path`: only the rate and whether it is resampled, as a station has no loudness analysis. A station that reconnects sends the rate again.

## A station that drops or hangs

A station has no end, so the player asks the same address again when its stream ends or fails (`reconnect` in `AudioComponent.tsx`). Symptom of a station that is dropped every few seconds: a loop of a few seconds. Cause: a reconnect makes the station send its burst of recent audio again, and the counter of attempts was reset by every `playing`, so the pause stayed at one second. The counter now resets only after `stableAfter` (20 s) of playing without a break, so a station that keeps dropping is asked less and less often (up to 30 s).

A connection that stays open without sending never ends or fails. The player starts a watch on `waiting` and asks the station again after `stallTimeout` (15 s) when the element still has no data (not on `stalled`, which Chromium also sends when its buffer is full). The proxy (`radio-proxy.ts`) cuts the upstream socket after 20 s without data and sends `User-Agent: Tunelle`, as some stations refuse a client with none. To check a station by hand: `curl -s -D - -H 'Icy-MetaData: 1' <stream> -o /dev/null --max-time 30` shows whether it closes on its own.
