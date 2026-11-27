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
| The connection of a station breaks | nothing: `waiting`, so it is asked again by the 15 s stall watch, like a silent one |

So a cut short file is silent for the rest of its length. A single track at the end of a queue that is cut short has no next one to take over, which no test covers.

On Linux the decoder of a station (ffmpeg) outlives a broken connection: `child.kill()` (SIGTERM) does not end it while it waits for input, so the answer to the page never ends. The old process was still there after the player had connected again, beside the one of the new connection. On Windows the same call ends the process at once, so there the answer ends and the element raises `ended`.

## A station that dropped and did not come back

- **Symptom:** `radio-failures.spec.ts` failed on Windows in CI: after a drop the new tone was never heard, with the player showing a station at 00:00:01.
- **Cause:** the stream had ended, and Chromium played it again from its cache when the same address was set, `Cache-Control: no-store` or not. The station was not asked: the element replayed the last seconds, with a growing pause in between.
- **Fix:** each connection of a station has an address of its own (`loadAddressOf` in `client/audio/track-source.ts`). The query is ignored by the route.
- **Check:** on Linux, change both `child.kill()` of `out/electron/protocols/stream-decode.js` to `child.kill('SIGKILL')` after `npm run build` and run `e2e/functional/radio-failures.spec.ts`, which fails without the fix. A replay shows as `loadedmetadata` right after `loadstart`, with the length of the ended stream.

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
