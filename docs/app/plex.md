# Plex servers

Part of [#66](https://github.com/Koeroesi86/tunelle/issues/66), on the pieces of [sources.md](sources.md): the path of a track (`plex:<serverId>:<ratingKey>`), the server store, the `/source/audio` and `/source/cover` routes and the page. A Plex server has its own entry in the menu ("Plex servers") and the same page (`SourceServers` with `kind="plex"`).

## The client

`electron/services/sources/plex-client.ts` answers the same calls as the other clients (`ping`, `artists`, `albumsOf`, `tracksOf`, `search`, `stream`, `cover`).

- Token: the entry holds an access token (`X-Plex-Token`), either from the sign in with plex.tv below or entered by hand with the address of the server; the token is the secret of the entry (encrypted like a password) and is sent in the `X-Plex-Token` header with `X-Plex-Client-Identifier` (the id of the entry), never in an address. The user name of the entry is the fixed `plex`. A 401 is a `SourceError` with the code 40, which the page words as a wrong login. `ping` is `GET /library/sections`.
- JSON needs `Accept: application/json`. Artists are `GET /library/sections/{key}/all?type=8` of each section of the type `artist` (a music library); the albums of an artist and the songs of an album are `GET /library/metadata/{ratingKey}/children`; a search is `GET /hubs/search` grouped by the type of each hub.
- `stream` reads the path of the first part of the song (`/library/metadata/{id}`, kept for the life of the client) and then asks for that path with the `Range` of the player. The cover is `/library/metadata/{id}/thumb` with `width` and `height`.

### The library page

The page of a Plex server starts with the whole library, not the artists: the tabs Albums, Artists and Songs as a cover grid (songs as lines), sorted by what was added last or by title, 60 items per page with "Show more". The browse `library` is answered by `library` of the client with `GET /library/sections/{key}/all?type=9|8|10&sort=addedAt:desc|titleSort` of the first music section, paged with the parameters `X-Plex-Container-Start` and `X-Plex-Container-Size`; `totalSize` of the answer is the total. A server without a music section answers an empty page. Only the first music section is listed here; the search and a click on an artist or an album work as before. Genres and a search over the tabs are issue #499.

## Signing in with plex.tv

"Sign in with Plex" on the Plex page (`plex-account.ts`, `register-plex-listeners.ts`) does what the Plex documents describe for an app without a password:

1. `POST plex.tv/api/v2/pins?strong=true` gives a PIN (`id`, `code`), with the `X-Plex-Client-Identifier` of this sign in (a new UUID) and `X-Plex-Product: Tunelle`.
2. The default browser opens `https://app.plex.tv/auth#?clientID=…&code=…&context%5Bdevice%5D%5Bproduct%5D=Tunelle`, as the document "Authenticating with Plex" describes, through an address on `127.0.0.1` that redirects to it (`plex-redirect.ts`, see below).
3. The app polls `GET /api/v2/pins/{id}?code=…` every two seconds, for at most five minutes (the page has a cancel), until `authToken` is there.
4. `GET plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1` lists what the account has; the ones that provide `server` are the offer. The page gets the names only: the account token and the token of each server (`accessToken`, which a shared server needs, else the token of the account) stay in the main process.
5. An account with one server is added at once; with several, the page lists them and "Add" picks one (the list stays when the only server does not answer, so it can be tried again). Adding tries the addresses of the server in the order local, remote, relay (at most six), each with `GET /library/sections`, and keeps the first that answers, with the token of that server as the secret of the entry. The token is not renewed: when Plex ends it, the page words the 401 as a wrong login and the user signs in again.

Checked on 2026-11-20 against a real account: the listener (`register-plex-listeners.ts`, with only Electron faked) went from the PIN to the list of the servers of the account, and the client answered `GET /library/sections` on the local address of the server. Two things cost time:

- plex.tv answers 429 when many PINs are made in a short time (about ten in a few minutes while testing). The page of the PIN then did not show its prompt and ended on the home page of Plex Web with no error, and the app waited for ever. The errors of the app now name the call (`plex.tv answered 429 to POST /api/v2/pins`). Waiting five minutes cleared it.
- The prompt is the normal start. A browser that is signed in may be sent to Plex Web (`watch.plex.tv/…/me`) at the end: that is where the page ends, not a sign of a failure.
- A browser that ended on `watch.plex.tv/en-GB/me` with no prompt, only from the app (the same address pasted into the browser showed it), was a launcher that cut the address at its first `&`. On 2026-11-20 `xdg-open` of a KDE host with Vivaldi (Flatpak) turned `https://example.com/#?clientID=abc&context%5Bdevice%5D…` into `https://example.com/#?clientID=abc`, so plex.tv got no `code` and no PIN to approve. A sandboxed `xdg-open` (the portal of Flatpak) kept the address, and so did Electron's `shell.openExternal` there, which is why it did not show in the tests of a sandboxed shell. The app opens `http://127.0.0.1:<port>/<random path>` instead, which has no `&` and answers 302 with the address of plex.tv; the server listens on the loopback only, stops with the sign in (cancel, or five minutes), and answers anything else with 404. To check on a system: `xdg-open 'https://example.com/#?a=1&b=2'` and read the address bar.

## Terms of Plex

Read on 2026-11-20 (the Terms of Service of 2025-10-30): a client of the Plex API is an "Interfacing Software", which the terms allow under these conditions:

- The app must not offer "substantially the same functionality" as the Plex Solution, circumvent its security, overload it, or reach what only Plex Pass has (no download for offline use here).
- A privacy notice consistent with the privacy policy of Plex: the page of the site lists what the app contacts (`site/templates/privacy.html`).
- The name "Plex" needs the permission of their Trademarks and Guidelines policy, which was not read: until it is, the text stays as plain naming of a compatible server.
- The licence of the source (MIT) is compatible with the licence the terms ask for.

## Not verified

The paths, the headers and the fields were read in the OpenAPI document of the Plex Media Server (1.2.3). Nothing was tried against a real server.

- That `Range` is answered with 206 for a file of `/library/parts/…` (the document does not say), and the 503, 509 and 403 answers of the stream.
- `/hubs/search` (not in the document that was read).
- A real server (2026-11-20, Plex Media Server with a music library) sent neither `childCount` on the artists of `/library/sections/{key}/all?type=8` nor `leafCount` on the albums of `/library/metadata/{id}/children` or `?type=9`: the lists have no counts, so the page shows none for Plex (`albumCount` and `songCount` are optional). The counts are read when the server sends them, and an artist or an album list that shows "0" was this.
- The sign in is the PIN flow that issues a token that does not rotate. The JWT flow that Plex recommends (an Ed25519 key, a token of seven days that is refreshed) is not built, and Plex plans to end the tokens that do not rotate; the date was not found. Whether `code` is needed in the check of the PIN, and the exact fields of `resources` (`provides`, `accessToken`, `connections`), were read in the document and not tried on plex.tv.
- Only the first sign in was thought through for a server that is shared with the user: its `accessToken` is used, and nothing was tried.
