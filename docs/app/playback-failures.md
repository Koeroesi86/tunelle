# When something does not play

`AudioComponent` decides what follows an `error` of the element that plays, and the player stays playing meanwhile:

- A file is loaded once more at the same position, as a stream can break midway. When that fails too, the player moves on to the next track.
- After more than 10 files in a row that fail, the player stops, instead of going through the whole queue.
- A station is asked again, with a growing pause between the attempts. A station that drops is also asked again when its stream ends, and one that sends nothing for 15 s after the player ran out of audio.

`client/audio/context.ts` only announces the failure (`addPlayFailureListener`); it does not report "not playing".

## What Chromium raises

Seen on Linux with the built app (2026-11-27):

| What happens | What the element does |
| --- | --- |
| The file is gone, or holds no audio | `error` |
| A FLAC file is cut short | nothing: `waiting` where the data ends, and the next track starts when the full length has passed, as the gapless hand-off is timed |
| The connection of a station breaks | `ended` for a decoded station, as its decoder is killed; it is asked again |

So a cut short file is silent for the rest of its length. A single track at the end of a queue that is cut short has no next one to take over, which no test covers.

## A decoder that stayed after its station

- **Symptom:** on Linux, a broken connection raised nothing in the page, so only the 15 s stall watch brought the station back. The old ffmpeg stayed beside the new one. A station that was left while it sent nothing kept its ffmpeg too.
- **Cause:** `child.kill()` sends SIGTERM, which does not end an ffmpeg that waits for input on `pipe:0` (measured with ffmpeg 9.0.2: the process ended only at the fourth one). On Windows the same call ends the process at once.
- **Fix:** `stream-decode.ts` kills it with SIGKILL. It writes to a pipe only, so no file is left half written; audio that it had not written yet is dropped. Not measured on macOS.
- **Check:** the two decoder tests of `stream-decode.integration.test.ts` fail with `child.kill()`.

## A station that dropped and did not come back

- **Symptom:** `radio-failures.spec.ts` failed on Windows in CI: after a drop the new tone was never heard, with the player showing a station at 00:00:01.
- **Cause:** the stream had ended, and Chromium played it again from its cache when the same address was set, `Cache-Control: no-store` or not. The station was not asked: the element replayed the last seconds, with a growing pause in between.
- **Fix:** each connection of a station has an address of its own (`loadAddressOf` in `client/audio/track-source.ts`). The query is ignored by the route.
- **Check:** `e2e/functional/radio-failures.spec.ts` fails without the fix. A replay shows as `loadedmetadata` right after `loadstart`, with the length of the ended stream.

## A queue that stopped on a broken file

- **Symptom:** a deleted or garbled file in a queue stayed in the player bar, paused, while the unit tests of `AudioComponent` passed.
- **Cause:** `context.ts` reported "not playing" for the `error` event, so the second failure found a paused player and did not skip. By the code, the same report also cancelled the reconnect of a station after an `error`; that was not seen in the app.
- **Check:** `e2e/functional/broken-files.spec.ts` after `npm run build`. To see the events, add capturing listeners for `error`, `pause` and `play` on `document` from the test and print `element.error.message`.

## The tests of the real app

| What | Test |
| --- | --- |
| A file of the queue that is deleted, cut short or no audio | `e2e/functional/broken-files.spec.ts` |
| A server that goes away in the middle of a track | `e2e/functional/servers.spec.ts` |
| The output device switched and unplugged | `e2e/functional/output-device.spec.ts` |
| A station that drops or goes silent | `e2e/functional/radio-failures.spec.ts` |
