# Artist photos

The photo of an artist or album artist is found once on Deezer (`electron/services/artist-photos.ts`) and can be changed by the user (`electron/services/artist-photo-choice.ts`). Both are kept in `artist_photos` (migrations 010 and 016), by the name as the library compares it, and the file is in the `albumart/` folder next to the covers (`artist-<hash of the name>…`).

## What the user can do

The header of an open artist or album artist shows its photo (or, with none, the cover of one of its albums, from `/library/group-cover`) and the button **Change photo**, which has these entries:

- **Choose an image…** takes a JPEG, PNG or WebP file of up to 2 MB (the type is read from the first bytes, not from the name). A file that is missing, too large or not such an image shows its reason in the header (`ARTIST_PHOTO_FAILED`) and changes nothing. It works with the lookup of the photos turned off, as the file stays on the computer.
- **Use the album cover** keeps no photo for the name, so the cover of one of its albums shows. The row has `manual = 1` and no picture.
- **Reset the photo** deletes the row, so the name is looked up as if it was new (when the lookup is on).
- **Search online…** (only while the setting Artist photos is on, as it sends text to Deezer) searches Deezer for a text, which starts as the name and can be changed, and lists the artists with a photo (`ARTIST_PHOTO_SEARCH`, answered by `ARTIST_PHOTO_CANDIDATES` with the text that was searched, so an answer for an older text is ignored). The one picked is downloaded by the main process (`change: 'download'`) and kept as a manual photo. The renderer loads the thumbnails from Deezer itself. A picture to download must be an https URL on `*.dzcdn.net` (`artistPhotoChangeSchema`), so the page cannot make the main process fetch another server.

## Rules

- `manual = 1` is a choice of the user: the queue never looks the name up (however old the row), and a lookup that was running when the choice was made does not overwrite it (`WHERE artist_photos.manual = 0` in the upsert).
- A chosen file is named by what is in it (`artist-<hash of the name>-<hash of the image>.<ext>`), so a replaced photo is another URL and the renderer does not show the cached one. The file it replaces, and the smaller copy made of it, are deleted; only a file that starts with `artist-` is ever deleted.
- The change is sent on `ARTIST_PHOTO_CHANGE` (`{ key, change }`, read by `artistPhotoChangeSchema`) and answered with `ARTIST_PHOTOS_READY`, which makes the lists fetch their covers again.

## Not done yet

- Refreshing a photo that changed on Deezer (the issue #211 asks how a change is detected; the file name by content is ready for it).
- A menu on the tile; the button is on the page of the artist, which a touch screen has too.
- Album covers have their own choice, see [album-covers.md](album-covers.md); a search online is not offered for them.
