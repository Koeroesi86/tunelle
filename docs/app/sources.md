# Servers of the user (Subsonic and Jellyfin)

Part of [#66](https://github.com/Koeroesi86/tunelle/issues/66): the music of a server that the user runs (Navidrome, Subsonic) is browsed and played like the library. Jellyfin has its own client on the same pieces ([jellyfin.md](jellyfin.md)). The main process holds everything that is secret or has an address, the page names a track and a server by id.

## The path of a track

`<source>:<serverId>:<id>` with the source `subsonic` or `jellyfin`, for example `subsonic:5f6a1c1e-…:song-42` (`shared/schemas/sources.ts`). The server id is a UUID made when the server is added, the id is whatever the server calls the song and may hold a colon. `radio:<uuid>` stays as it is: a station has no server.

## The routes

`/source/audio?path=<path>` and `/source/cover?path=<path>` of the `tunelle://app` protocol (`electron/protocols/source-protocol.ts`, see [tunelle-protocol.md](tunelle-protocol.md)). The page never gets the address of the server or a URL with a token: the host comes from the stored server, so the route is not an open proxy, and a path of another source, a server that is not stored or a bad id is a 404. The `Range` header of the player is passed on so seeking works, and a server that does not answer is a 502.

## The calls

`electron/services/sources/subsonic-client.ts`, one client per server, kept by `sources.ts` and dropped when the server is saved or removed.

- Each call sends `u`, `t`, `s`, `v=1.16.1`, `c=tunelle` and `f=json`, with `t = md5(password + salt)` and a new random salt of 16 hex digits. The API asks for md5 from version 1.13.0 and a salt of at least six characters; the plain `p` is documented as "for testing purposes", and is never sent. The md5 is the protocol's, not a choice of ours: it is a token a server checks, not a store of passwords. The token of a call travels with it, so a server on plain `http` lets whoever sees the traffic repeat that call.
- Subsonic answers an error with the HTTP status 200 and `status: "failed"` with a code (40 is a wrong user or password, 70 is data not found). The client turns it into a `SubsonicError`. A status outside 200-299, a body that is not an answer of a Subsonic server and one that has not the shape of the call (a Zod schema each) are errors too.
- `stream` asks for `format=raw`, which both Subsonic (since 1.9.0) and OpenSubsonic document as "disable transcoding". On an error `stream` answers a document and not audio ("an XML document on error", content type `text/xml`), so a JSON, XML or HTML answer is a 404 and not audio.
- Every request has the `User-Agent` of the app and a timeout of 10 s for the answer to start. The body of a list is limited to 16 MB.

## Certificates

A server with a valid certificate needs nothing. A server with a self-signed one is approved by the user, as the host of the remote listening is ([remote-access-discovery.md](remote-access-discovery.md)): `SOURCE_CERTIFICATE` connects without checking, reads the certificate and sends it back with the code of its fingerprint (`approvalCode`) to compare, and the page sends the server with that certificate. Every later call is pinned to it (`pinnedOptions`: it is the only `ca`), which `rejectUnauthorized: false` is not.

## The password

`electron/services/sources/server-store.ts` keeps the servers in `sources/servers.json` of the [app data folder](user-data.md), readable by the user only (mode 0600). The password is encrypted with `safeStorage` and the page never gets it back: it sends it once and sees `protected`. Where the system has no keyring (`isEncryptionAvailable()` is false, or the Linux backend is `basic_text`, which encrypts with a fixed password) the password is kept in plain text and `protected` is false, for the page to warn about. A server is checked with `ping` before it is kept.

## What a kind can show

`sourceCapabilities` in `shared/schemas/sources.ts` says per kind what the page can show besides the artists, albums and tracks drill down that every kind has. Today `library` (the albums, artists or songs of the whole server, in pages) is there for Plex and Jellyfin; a kind lists the `sections` and `sorts` it answers, and the page shows only those: the tabs of a library with one or two sections, no sort when there is one order, and the drill down at the top when there is no library. A client that lists a library has `library(kind, sort, start, size)` (`SourceLibrary` in `electron/services/sources/sources.ts`) and answers a `SourcePage`. Subsonic lists the albums (`getAlbumList2`, `newest` or `alphabeticalByName`, with `offset` and `size`) and the artists (`getArtists` has no paging, so the client cuts the page), and no songs: the API has no call that lists all of them. It tells no count of the albums, so a page has no `total` and the page offers "Show more" while the last page is full; the artists have one order only, so the order of the newest is the one by name. To give another kind a library, add the method to its client and its entry to `sourceCapabilities`.

## The page

Online, "Subsonic servers" (`client/components/pages/source-servers/`, state in `client/redux/sources/`). The page lists the servers, adds one (name, address, user, password), removes one, and links to the sections of its kind (a home of the kind, shown once the kind has a server; the sections come from `sourceCapabilities`). The library is on its own page, below. A track plays through `/source/audio` (`client/audio/track-source.ts`); `isSourcePath` keeps such a track out of the history, the loudness measurement and the gapless preload, which are for files.

- A wrong login (code 40) is worded in the language of the page, any other failure shows what the server said.
- An address with `http` shows a warning: the token of a call travels with it.
- After a failed add of an `https` address the page offers to read the certificate. It shows the code (`approvalCode`) to compare with the one the server shows, and "Approve and add" sends the server with that certificate, which every later call is pinned to.
- A server with `protected: false` shows that its password is kept in plain text.
- The Online group of the sidebar has a group for each provider (Subsonic, Jellyfin, Plex) that folds on click; the folded ones are saved (`closedSources`) and all start open. A provider holds "Servers", the page where its servers are added and removed, and once it has a server the sections of its library (`Albums`, `Artists`, `Songs`, only those in `sourceCapabilities`, named `Plex: Albums` for a screen reader), which open `<kind>:<section>` of `OnlineView`. A folded provider shows as the current one while one of its pages is shown. A section shows the library of one server of the kind, with a server picker when the kind has several (the lists are windowed and need the whole height, so they are not stacked). Only the section that is shown loads. The sidebar loads the servers when it starts.
- A section is the library views of the local library, connected to a server (`SourceLibrary`, `client/components/pages/source-library/`): `AlbumView`, `GroupView` and `TrackView` through the containers `source-albums`, `source-artists` and `source-tracks`, so the tiles are windowed and paged as the local ones and a server that tells no total keeps paging. An artist opens its albums, an album its tracks, with a back button. The cover is the path of the cover on the server, which `getCoverUrl` sends to `/source/cover`. The toolbar is the local search field (a `search` request, answering all three lists) and a sort chip for the order of a library list (recent or title; a server sorts one way, so there is no direction). Playing an album opens it, and "Select all" of the tracks selects what is loaded.
- The state keeps the answers as page caches (`client/redux/sources/lists.ts`): `albums`, `artists` and `tracks`, by `listKey` (every page of a library list is one list). The caches are owned by the reducer, so their identity changes only on an answer, as `usePageLoader` loads again when it changes. `browsed` keeps the error of a request (`browseKey`).

## Not done yet

- Changing a server: remove it and add it again.
- OpenSubsonic extensions. `apiKeyAuthentication` would avoid keeping a password (`apiKey=` and no `u`; a server answers 43 for both), and `getOpenSubsonicExtensions` tells which a server has.
- Playlists, starred items, scrobbling, favourites of a track of a server.

## Not verified

What the documentation of [Subsonic](https://www.subsonic.org/pages/api.jsp) and [OpenSubsonic](https://opensubsonic.github.io/docs/endpoints/stream/) says was read on 2026-11-20; nothing was tried against a real server yet.

- `Range` is not mentioned by either documentation, so seeking is checked on a Navidrome before the page ships.
- The documentation does not say whether the suffix `.view` is optional. All its examples use it, so the client does.
- Whether a server that ignores `format=raw` sends a transcoded file (and a `Content-Type` that tells).
- The look of the tiles and rows with a server's data (the favourite and playlist buttons of a tile on an album of a server) was not seen in the running app.
- The page was tested with component tests only, not in the running app against a server: the layout at the three sizes, the approval of a certificate and playing a track are not seen.

## Load and rate limits

A window of tiles asks for dozens of pages and covers at once, which a server answers late or refuses. `openSource` asks a GET again when the server says 429 or 503 (at most twice, after the `Retry-After` it names, capped at 5 s, else 0.5 s and 1 s). The pages of a list are asked a few at a time per server (`createGate`, 4), the same request that is on its way is not asked again (`register-source-listeners.ts`), and the covers go through a gate of 6 per server. A cover is kept by the page for a day (`Cache-Control: private, max-age=86400`) and an answer that is an error is not (`no-store`). The tiles show a cover as a background image, which has no way to ask again after a failure: a cover that failed after its retries stays blank until the page is shown again. Plex asks for its music sections once per client. Connections are not pooled (`agent: false`), so every request pays its handshake.

The views of a server fetch two pages ahead of the window (`pagesAhead` of `usePageLoader`, set by the `source-*` containers; the local library has none), up to the end of the list, so a scroll finds the next pages there. They go through the same gate, so they share the queue with the pages the window needs (in order, so after a jump the window waits for the prefetch that is already queued).

A scroll that jumps leaves pages queued that nobody wants. The views tell the main process which pages the window wants (`keepPages`, `SOURCE_BROWSE_KEEP`), and the pages of that list that still wait for their turn are dropped (`createGate().drop`); a page that already runs is left to finish, and one that was dropped is asked again if it is wanted later.
