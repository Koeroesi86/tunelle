# The `tunelle://app` protocol

The renderer reaches the main process data (library, covers, audio, stations) and the page itself through the `tunelle://app` protocol (`electron/protocols/tunelle-protocol.ts`, URLs from `client/services/local-url.ts`), not through a port.

A handler never throws into the main process: an error of a stream ends that stream (`pipeline`, not `pipe`), as an unhandled one opens a blocking error dialog.

The `/track` route serves a file of the library by its path. A track in a codec that Chromium does not play is decoded to a WAV file first and that file is served instead (see [decoder-proxy.md](decoder-proxy.md)); the decode ends when the page [lets the request go](#when-the-page-lets-a-request-go).

The `/source/audio` and `/source/cover` routes serve the audio and the cover of a track of a server of the user by its path (`subsonic:<serverId>:<id>`); the host comes from the stored server and never from the request (see [sources.md](sources.md)).

## When the page lets a request go

An `<audio>` element lets its request go when its `src` changes, when it is removed and `load()` is called (not before the `load()`), and on a seek; a `fetch` that is aborted and a reload of the page do too ([#576](https://github.com/Koeroesi86/tunelle/issues/576)).

- **Symptom:** the decodes and downloads of skipped tracks ran to their end, and the current track waited behind them.
- **Cause:** `request.signal` of `protocol.handle` never aborts (Electron 45.3.1). A test that makes its own signal does not show this. The body of a streamed response is cancelled, but a request that has no response yet, as during a whole decode, hears nothing.
- **Fix:** `electron/protocols/request-aborts.ts`. `webRequest.onBeforeSendHeaders` tags each request of `tunelle://app` with its id (the header `x-tunelle-request`, which the page does not send itself) and keeps an `AbortController` for it, `onErrorOccurred` (`net::ERR_ABORTED`) aborts it, `onCompleted` forgets it. `handleTunelleRequest` gives the routes that signal. A request whose id is not kept any more has ended, so its signal is aborted from the start: a route checks the signal, as a listener that is added to an aborted one is never called.
- **Not a new `Request`:** the routes get a plain `{ url, headers, signal }`. In Node 24.21.0 and in the Node of Electron (24.22.2) the signal of `new Request(url, { signal })` stops aborting once that request is garbage collected, so a route that keeps only the signal misses the abort. To check: take `new Request(url, { signal }).signal`, run `gc()` a few times (`--expose-gc`), abort the controller and read `aborted`.

Measured with a window that is not shown, an `<audio>` element and a handler that never answers or streams a WAV (Linux, Electron 45.3.1): the handler was called before the error even when `src` changed every few milliseconds; two elements with one address have a request each; a seek makes several range requests and lets some go; a request that was wanted stayed pending for 40 s. For a streamed response the error comes before the `cancel` of the body, and an answer or a body error after the abort raised nothing in the main process. The headers a handler gets are the same with and without the hook, plus the id.

An element has to let go for any of this to happen. The player keeps two of them ([audio-context.md](audio-context.md)), and the one that Next takes over from is paused, which keeps its request. `preloadNext` (`client/hooks/use-gapless-audio.ts`) gives it the track that follows, or empties it when nothing follows.

- **Symptom:** a skip to the last track of the queue left the decode of the one before it running.
- **Cause:** `takeOver` records the element as holding nothing, so with nothing to follow `preloadNext` saw no change.

The tests sit as low as they can show something: the tagging and the signal (`request-aborts.test.ts`, `tunelle-protocol.test.ts`), the queue of the decodes and the mark of the measurement (`decoded-track.test.ts`, `serve-track.test.ts`, `measure-track.test.ts`), a station that is let go (`radio-protocol.test.ts`, `radio-proxy.test.ts`) and the emptied element (`AudioComponent.test.tsx`) are unit tests. That Chromium reports the abort needs Electron, which the integration tests run without, so one end to end test does it: `e2e/functional/skip.spec.ts` skips through long MP3 tracks to the last one and expects one new file in the decode cache.

