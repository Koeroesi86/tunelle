# Jellyfin servers

Part of [#66](https://github.com/Koeroesi86/tunelle/issues/66), on the pieces of [sources.md](sources.md): the path of a track (`jellyfin:<serverId>:<itemId>`), the server store, the `/source/audio` and `/source/cover` routes and the page. A Jellyfin server has its own entry in the menu ("Jellyfin servers") and the same page (`SourceServers` with `kind="jellyfin"`), which lists and adds only the servers of its kind.

## The client

`electron/services/sources/jellyfin-client.ts` answers the same calls as the Subsonic client (`ping`, `artists`, `albumsOf`, `tracksOf`, `search`, `stream`, `cover`), so the listeners and the protocol do not know the kind (`createClient` in `sources.ts` picks it).

- Login: `POST /Users/AuthenticateByName` with `{ Username, Pw }`, which `source-request.ts` sends as JSON. The token (`AccessToken`) is kept in memory for the life of the client and sent in the `Authorization` header (`MediaBrowser Client, Device, DeviceId, Version, Token`), never in an address. The password is sent only to log in. A 401 or 403 of the login is a `SourceError` with the code 40, which the page words as a wrong login; a call answered with 401 logs in again once.
- Artists are `MusicArtist` items of `GET /Items` (`recursive`, `fields=ItemCounts`): `GET /Artists` is marked deprecated in the OpenAPI document and none replaces it is named. Albums are `MusicAlbum` items with `albumArtistIds`, the tracks of an album are `Audio` items with `parentId`, and a search asks for the three kinds with `searchTerm`.
- `stream` is `GET /Audio/{id}/stream?static=true`, "the original file … streamed statically without any encoding", with the `Range` of the player. The cover is `GET /Items/{id}/Images/Primary?maxWidth=600`; an album has one only when `ImageTags.Primary` says so.
- The certificate, the timeout, the `User-Agent` and the limit of a list are those of `source-request.ts`.

## Not verified

Read on 2026-11-20 in the OpenAPI document of the stable release (12.4.0, `api.jellyfin.org`): the paths, the parameters of `/Items`, `AuthenticateUserByName` (`Username`, `Pw`), `AuthenticationResult` (`AccessToken`), `ItemFields` and `static` of the stream. Nothing was tried against a real server.

- The format of the `Authorization` header is not in the document (its scheme is only "API key header parameter"); it is the one the Jellyfin clients use.
- That the answer to a wrong password is 401 (and 403 for a user that is disabled), that `Range` is answered with 206, and that `MusicArtist` items are listed by `/Items` and carry `AlbumCount` with `ItemCounts`.
- The picture of a song: a track has the cover of its own item, which may be none, as only albums are checked for a picture.
- The page was tested with component tests only, as the Subsonic one.
