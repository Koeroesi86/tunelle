---
paths:
  - "electron/protocols/**"
  - "client/services/**"
---

# The `tunelle://app` protocol

The renderer reaches the main process data and the page itself through the `tunelle://app` protocol, not through a port. A handler never throws into the main process: an error of a stream ends that stream (`pipeline`, not `pipe`), as an unhandled one opens a blocking error dialog ([docs/app/tunelle-protocol.md](docs/app/tunelle-protocol.md)).
