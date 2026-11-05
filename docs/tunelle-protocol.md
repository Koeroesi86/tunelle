# The `tunelle://app` protocol

The renderer reaches the main process data (library, covers, audio, stations) and the page itself through the `tunelle://app` protocol (`electron/protocols/tunelleProtocol.ts`, URLs from `client/services/local-url.ts`), not through a port.

A handler never throws into the main process: an error of a stream ends that stream (`pipeline`, not `pipe`), as an unhandled one opens a blocking error dialog.
