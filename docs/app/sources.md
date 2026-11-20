# Servers of the user (Subsonic)

Part of [#66](https://github.com/Koeroesi86/tunelle/issues/66): the music of a server that the user runs (Navidrome, Subsonic) is browsed and played like the library. Jellyfin follows with its own API on the same pieces. The main process holds everything that is secret or has an address, the page names a track and a server by id.

## The path of a track

`<source>:<serverId>:<id>`, for example `subsonic:5f6a1c1e-…:song-42` (`shared/schemas/sources.ts`). The server id is a UUID made when the server is added, the id is whatever the server calls the song and may hold a colon. `radio:<uuid>` stays as it is: a station has no server.

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

## Not done yet

- The page: adding a server, the warning, browsing, playing (the next pull request). The IPC is there: `SOURCE_SERVERS`, `SOURCE_SERVER_SAVE`, `SOURCE_SERVER_REMOVE`, `SOURCE_CERTIFICATE`, `SOURCE_BROWSE`.
- OpenSubsonic extensions. `apiKeyAuthentication` would avoid keeping a password (`apiKey=` and no `u`; a server answers 43 for both), and `getOpenSubsonicExtensions` tells which a server has.
- Playlists, starred items, scrobbling, several servers at once.

## Not verified

What the documentation of [Subsonic](https://www.subsonic.org/pages/api.jsp) and [OpenSubsonic](https://opensubsonic.github.io/docs/endpoints/stream/) says was read on 2026-11-20; nothing was tried against a real server yet.

- `Range` is not mentioned by either documentation, so seeking is checked on a Navidrome before the page ships.
- The documentation does not say whether the suffix `.view` is optional. All its examples use it, so the client does.
- Whether a server that ignores `format=raw` sends a transcoded file (and a `Content-Type` that tells).
