# Electron security

`npm run security:electron` runs Electronegativity on `electron/` and fails on a finding that is not in `electronegativity-baseline.json`. The check also fails when a baseline entry no longer fires, so the file only holds what is written down here. After a fix: `node scripts/checks/security-scan.js --update`.

## What is fixed

- Both windows write out `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` and `disableBlinkFeatures: 'Auxclick'` instead of resting on the defaults of Electron.
- `electron/windows/media-permission.ts` sets `setPermissionRequestHandler` beside the check handler: the page of the app may ask for `media`, everything else is refused.
- The response of the page gets a `Content-Security-Policy` header from `session.webRequest.onHeadersReceived` (`watchPageHeaders` in `electron/protocols/tunelle-protocol.ts`), and `e2e/functional/system.spec.ts` checks that the page refuses code made from a string: only its own origin for scripts, no `unsafe-eval`, no objects, frames or forms. `unsafe-inline` is allowed for styles only, as the components set inline styles. The page of a development run comes from the dev server and has no policy.

## What stays in the baseline

| Entry | Why it stays | Can it be fixed |
| --- | --- | --- |
| `PRELOAD_JS_CHECK windows/create-window.ts` | False positive: the rule fires on every `preload` option, and the window is sandboxed and context isolated. The preload imports only `electron` and exposes a narrow API through `contextBridge`. | No, the preload is needed. |
| `PRELOAD_JS_CHECK library/loudness/loudness-window.ts` | The same: sandboxed, context isolated, no node integration. | No. |
| `OPEN_EXTERNAL_JS_CHECK listeners/register-update-listeners.ts` | `shell.openExternal(releasesUrl)` takes a constant address; the renderer sends no payload with `OPEN_RELEASES`. | No, a false positive. |
| `CSP_GLOBAL_CHECK protocols/tunelle-protocol.ts` | The policy is now read and rated by the scanner, whose one remark is the generic one that `script-src 'self'` can be abused where an origin hosts JSONP or user uploads. The page needs `'self'` for its bundle; the origin serves no JSONP, and library files are served as audio and images, which Chromium refuses as scripts. | Only with a nonce or hash per script, which the bundle does not support. |
