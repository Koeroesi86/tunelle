# The soak run

`e2e/soak/soak.spec.ts` (`npm run soak` after `npm run build`) plays the built app for a long time and looks for what builds up, which no shorter test shows. `.github/workflows/soak.yml` runs it on Linux, macOS and Windows every Monday and by hand (`gh workflow run soak.yml`). It never runs for a pull request.

## The two kinds of round

`SOAK_ROUNDS` (10 by default) says how many rounds of each kind are judged, after one that fills the caches and the pools. First come all the changes of track, then all the changes of output.

A round of changes of track:

- In four albums (generated FLAC, which a window decodes; WMA and MP3, which are decoded whole to a file; AAC, which Chromium plays) 8 tracks each are left to end by a seek to their last 1.2 s, then Next three times and Previous once leave decodes before they are done.
- The three changes of the generated album are recorded to their ends ([measuring gapless playback](gapless-measurement.md)).

A round of changes of output: the output goes to a second device at 96 kHz, which is unplugged, plugged in and left for the default, so four audio contexts come one after the other.

After each round, paused, every decoder has to end and no `.part` file may stay in the decoder cache. Then the numbers are taken.

### Why the two are not mixed

Symptom: a listener added to the audio element on every change of track did not fail a soak whose rounds ended with the changes of output. Cause: a change of output replaces the audio context, which makes the audio elements again, so whatever had built up on them was gone before the numbers were taken. How to check: add `node.addEventListener('timeupdate', () => {})` to `activateNode` (`client/audio/context.ts`), build and run with `SOAK_ROUNDS=3`; `listeners` has to fail for the changes of track (+94 on 2026-11-28). What builds up over the changes of track and is dropped by a change of output must be sampled before one happens.

## What is judged

Each kind of round is judged by itself. A number fails the run when the median of the last third of its rounds is over the median of the first third by more than its limit (`limits` in the spec, `scripts/tooling/soak-judge.ts`), so one high reading does not count: processes, active resources of the main process (its timers, sockets and child processes), open files of the main process (Linux only, from `/proc`), memory, DOM nodes, event listeners, open audio contexts and files of the decoder cache. The limits of the caches themselves are unit tested (`decoded-track.limits.test.ts`, `windowed-track.test.ts`, `source-download.test.ts`).

At most one in ten of the recordings may have a silence over 1 ms, and one in ten of the overlaps may be over 60 ms, as a loaded runner starves the audio thread now and then. The median overlap may not grow by more than 20 ms from the first third to the last.

## Memory that rises and then levels off

Symptom: the working set of the app rises by some 20 MB a round while the heaps, nodes, listeners and handles stay as they are. All of it is in the renderer of the player (`tabMb` in the log; the other `…Mb` numbers are the other kinds of process). Measured on Linux on 2026-11-28:

| What was repeated | Renderer of the player |
| --- | --- |
| output switches only, 60 of them | flat |
| changes of track only, rounds 0 to 11 | 284 MB to about 440 MB |
| changes of track only, rounds 12 to 25 | 427 to 445 MB, no rise |
| then critical memory pressure (CDP `Memory.simulatePressureNotification`) | about 40 MB given back |
| the whole run: 11 rounds of changes of track, then 11 of output | 356 MB to about 520 MB, then flat through the changes of output |

So the run of 25 rounds levelled off, which points to what Chromium keeps of the media it loaded; which cache it is was not found out, and the level differs between runs. Ten rounds end while it still rises, so the limit of `totalMb` leaves room for it (138 MB by thirds in the full run, which took 10 minutes). A leak that is smaller than that room is only seen by a longer run: set `SOAK_ROUNDS` to 25 and read `tabMb` of the changes of track from round 12 on.

## What the test has to give back

The harness holds on to things too, which would read as a leak of the app:

- The audio probe keeps every window it heard: it only listens while a round reads it.
- A recorder worklet runs for as long as its `process` answers true: `stopRecording` ends it.
- The probe lets go of the tap of a closed context.
- A trace of Playwright of so long a run is off (`playwright.config.ts`).
