# Radio station logos

The directory (radio-browser.info) lists an image address (`favicon`) per station. The address stays in the main process: the page asks for `/radio-logo/<uuid>` of the [`tunelle://app` protocol](tunelle-protocol.md), and `electron/services/radio/radio-logos.ts` downloads the image. A station without a logo, or with one that does not load, shows the radio icon (`StationLogo`).

## Where the address comes from

`radio-browser.ts` remembers the address of every station the directory answered with. The addresses of the stations of the history and the favourites are also stored in `radio-logos.json` of the app data folder, written when those lists are loaded (`findStations`), so a logo is known when the directory can not be reached. The last 500 are kept (`stored-addresses.ts`, which holds the stream addresses of `radio-streams.json` the same way).

## The cache of Chromium

The images are kept by the HTTP cache of Chromium, on disk in the user data folder: it sets its own size limit and drops old entries, so the app writes no image files.

- **Symptom:** every start downloaded every logo again.
- **Cause:** Node's `fetch` has no cache, and the `Cache-Control` of a `tunelle://app` response does not put anything in the HTTP cache.
- **Fix:** `net.fetch` of Electron, with `cache: 'force-cache'` (the stored copy, however old) and `credentials: 'omit'` (no cookies).
- **A failure is stored too.** With `force-cache` a stored 404 or 500 is answered again, also after a restart, so an answer that is no image is asked for again with `cache: 'reload'`, which replaces it. A server that does not answer is not asked twice.

Within a run, the answer per station (also "no logo") is kept in memory, so a broken logo costs the server one request per run, two on the first.

## What was measured

On 2026-11-27, Linux, Electron 45.3.1, a local server and two runs with one user data folder:

| Answer of the server | `force-cache`, asked again after a restart | `default`, asked again after a restart |
| --- | --- | --- |
| 200 without cache headers, `max-age=0`, `no-cache`, or with a cookie | no request | request |
| 200 with `no-store` | request | request |
| 404 or 500 | no request (the failure is answered) | request (a 404 with `max-age`: no request) |
| 200 after `reload` replaced a stored 500 | no request, also with the server down | not measured |

So a logo whose server sends `no-store` is not kept, and a logo that changes at the same address stays old until Chromium drops the stored copy.

To check again: run a script with the `electron` of `node_modules` (on Linux with `--no-sandbox --ozone-platform=headless`) that sets `userData` to a folder, serves these answers on a fixed port, counts the requests and calls `net.fetch` twice; then run it a second time.
