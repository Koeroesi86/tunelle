# The `tunelle://app` protocol

The renderer reaches the main process data (library, covers, audio, stations) and the page itself through the `tunelle://app` protocol (`electron/protocols/tunelle-protocol.ts`, URLs from `client/services/local-url.ts`), not through a port.

A handler never throws into the main process: an error of a stream ends that stream (`pipeline`, not `pipe`), as an unhandled one opens a blocking error dialog.

The `/track` route serves a file of the library by its path. A track in a codec that Chromium does not play is decoded to a WAV file first and that file is served instead (see [decoder-proxy.md](decoder-proxy.md)); the request signal ends the decode.
