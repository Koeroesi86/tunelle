# Client backend

The renderer does not call Electron. It calls a `Backend` (`client/backend/backend.ts`), and the Electron implementation (`client/backend/electron-backend.ts`) is set once in `client/app.tsx` with `setBackend`. A web or React Native host brings its own `Backend` and the rest of the client stays as it is.

## What a backend gives

- `send(channel, payload)` and `on(channel, listener)`: the messages of the main process (the channels of `electron/listeners/` and the schemas in `electron/schemas/`). The Redux middleware, `onMessage` and the hooks use them, never `window.electronAPI`.
- `resolveUrl(route)`: the address of everything the host serves (library pages, covers, audio). `localUrl` in `client/services/local-url.ts` calls it. Electron answers with `tunelle://app<route>` (see [tunelle-protocol.md](tunelle-protocol.md)).
- `pathForFile(file)`: the path of a dropped or picked file on the disk of the host. A host that has no such path needs another way to add a folder (not done yet).
- `capabilities`: `blur` (the window blurs behind its translucent parts) and `mpris` (the host owns the media controls of the desktop, so the page does not use `navigator.mediaSession`, see [mpris.md](mpris.md)). A feature of the platform is a capability, not a check of `window.electronAPI`.

## Not set

Without `setBackend` (a unit test, a plain browser) the backend is detached: it sends and hears nothing, reports no capability and resolves `tunelle://app`. A unit test sets a fake `Backend` with `setBackend` instead of stubbing `window.electronAPI`; a test that resets modules sets it after the import.

## What stays Electron only

The loudness window has its own preload and `loudnessAPI` (`client/loudness/`), outside the backend. A second host also needs the logic of `electron/` (database, scanner, ffmpeg) behind the same channels, which the backend does not provide.
