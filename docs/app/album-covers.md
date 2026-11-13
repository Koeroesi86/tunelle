# Album covers

The cover of an album is the picture in the tags of its tracks (`electron/library/reading/read-track-file.ts` writes it into the `albumart/` folder). The user can change it from the panel of an open album (`electron/services/album-cover-choice.ts`); the choice is kept in `album_covers` (migration 017).

## What the user can do

The panel of an open album has the button **Change cover**, with these entries:

- **Choose an image…** takes a JPEG, PNG or WebP file of up to 2 MB, checked as for the photos of the artists (`readPhotoFile`, see [artist-photos.md](artist-photos.md)). A file that cannot be used shows its reason beside the button (`ALBUM_COVER_FAILED`) and changes nothing.
- **Search online…** searches MusicBrainz for release groups (`ALBUM_COVER_SEARCH`, answered by `ALBUM_COVER_CANDIDATES` with the text that was searched, so an answer for an older text is ignored). The text starts as the artist and the title and can be changed; each word must be in the title or the artist. The results show the small front cover of the Cover Art Archive (`front-250`), which the renderer loads itself; an album that has none does not load and is left out. The one picked is downloaded by the main process (`change: 'download'`, `front-500`) and kept like a picked file. A picture to download must be a `https://coverartarchive.org/release-group/<id>/front-250|500` address (`albumCoverChangeSchema`), so the page cannot make the main process fetch another server.
- **Remove the cover** keeps no cover for the album.
- **Reset the cover** forgets the choice and reads the tags of the tracks again, so the cover of the tags is back.

The search is the one the user starts by pressing Search, so it has no setting; the text goes to MusicBrainz as the covers of the radio do (`searchAlbums` of `electron/services/radio-art.ts`, which shares their queue and the limit of one request a second, so a search can wait a moment behind a radio lookup). The photos of the artists come from Deezer instead, see [artist-photos.md](artist-photos.md).

## How it is kept

- An album is a folder and a title, as the library lists it. Its key is the folder without the trailing separator, a NUL and the title (`albumCoverKey`; `albumCoverKeyColumn` is the same key for a row of `library`). Two albums with the same title in two folders are two albums.
- A change writes the picture of every track of the album in `library`, so the lists, the open album, the queue added later and the colour of the cover (`album_art`) follow without a second source of covers. It is sent on `ALBUM_COVER_CHANGE` (`{ path, title, change }`, read by `albumCoverChangeSchema`) and answered with `ALBUM_COVER_CHANGED` (`{ path, title, cover }`), which updates the open album and makes the lists fetch their pages again.
- A file the user chose is named `cover-<hash of the key>-<hash of the image>.<ext>`: a replaced cover is another URL, so the renderer does not show the cached one. The file it replaces, its smaller copy and its colour are deleted; only a file that starts with `cover-` is ever deleted, never the covers of the tags, which other albums may share.
- A scan that adds or reads a track again gives it the cover of its tags. `applyAlbumCovers` runs in the background job of the colours after every scan and puts the chosen cover back (`picture IS NOT` the chosen one), so the choice survives a rescan. The page shows it when it fetches the album next.
- The queue and the player keep the cover of the tracks they already have until the tracks are added again.
