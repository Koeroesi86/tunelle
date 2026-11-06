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

## The rate of a radio station

A station has no file, so no rate in the library. The proxy of the stream (`electron/protocols/radio-proxy.ts`) passes the audio through a `SampleRateTap`, which keeps the first 64 KiB until `detectStreamSampleRate` (`shared/utils/stream-sample-rate.ts`) finds a rate and then lets the rest go by untouched. It reads MP3 and AAC (ADTS) from two frame headers in a row, since the sync pattern of one frame can be in the data by chance, Opus as 48 kHz and Vorbis from its header; a stream of another kind has no rate and shows none. The main process sends it as `RADIO_STREAM_RATE`, the state keeps it as `streamSampleRate` for the station that plays (forgotten when another track starts), and the now playing page shows it in the same line as a file's rate, `LoudnessPanel` with no `path`: only the rate and whether it is resampled, as a station has no loudness analysis. A station that reconnects sends the rate again.
