# Measuring gapless playback

`e2e/functional/gapless.spec.ts` plays tracks to their ends and measures every sample the app sent out over the changes. The two tracks of a change are sines of different pitch, so the samples show both a silence and the time when the two sounded at once.

| Piece | Where |
|---|---|
| Recorder: an audio worklet on the bus of the probe (left channel) | `e2e/support/audio-probe.ts` (`startRecording`, `recordedSamples`) |
| `longestSilence`: the longest run of samples under 0.001 between the first and the last sound | `scripts/tooling/audio-joins.ts` |
| `overlapOf`: how long both tones were over half of their own highest level, in 10 ms windows every 0.5 ms | the same, good to 2 ms on made up signals (`audio-joins.test.ts`) |

`overlapOf` needs tones about as loud as each other (the quieter one at least a quarter of the louder) and 440 Hz apart or more: it fails when a tone was not heard.

## Why the windows of the probe are not enough

The probe reports windows of 1024 frames (about 23 ms at 44.1 kHz), and `longestGap` counts the silent ones. A shorter gap leaves sound in every window, and an overlap is never silent. On 2026-11-27, on Linux, the test that used it passed 5 of 5 runs with the hand-off taken out of the player (`startHandoff` of `use-gapless-audio.ts` returning at once), where the samples show gaps of 8 to 20 ms. The perf measurement (`e2e/perf/perf.spec.ts`) still uses `longestGap`.

## Why the recorder is a worklet

The probe is a `ScriptProcessorNode`, which runs on the thread of the page. **Symptom:** recordings of a steady tone made from its blocks jumped in phase, mostly at the edge of a block, in every run. **Cause:** it drops and repeats blocks when the page is busy, which reads as gaps and overlaps that were never played. **Check:** `x[n+1] + x[n-1] - 2cos(w) x[n]` of a sine of angle `w` per sample stays near 0 (under 0.0001 with the worklet, up to 0.4 with the script processor).

The page refuses a worklet module from a `blob:` address (see [end to end tests](end-to-end-tests.md)), so this spec starts the app with `bypassCSP` (`start({ bypassCSP: true })`). The policy of the app is not changed.

## What the player does

The next track is started a lead before the end of the playing one (`client/audio/gapless.ts`). The lead is 100 ms (`defaultLead`) until a start has been measured, then the median of the last starts, at least 10 ms. Linux, 2026-11-27, six runs:

| | First change | Second change |
|---|---|---|
| FLAC, overlap | 87 to 102 ms | 9 to 12 ms |
| AAC, overlap | 59 to 65 ms | one change only |
| Longest silence | at most 0.11 ms | |

So the **first change of a session overlaps** the two tracks for most of the default lead. That fits the lead less the time the second element takes to sound, which was not measured on its own. The test allows it: at most 120 ms of overlap at the first change and 60 ms at a later one, and 1 ms of silence. Lower the first limit when the player is changed.

A default lead of 250 ms failed the first limit (246 ms FLAC, 120 ms AAC), and a smallest lead of 200 ms failed the later one (201 ms).

Only Linux has been measured. A system that takes longer to start an element overlaps less at the first change, and its later changes depend on how much the starts differ from their median.

## The probe is installed once

`launchApp` adds the init scripts to the context and to the page, so a script can run twice on one load. `installAudioProbe` returns at once the second time: before, a second tap listened beside the first (`listenWithProbe` turned off only one), and a recording held everything twice on some starts.
