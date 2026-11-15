# Exporting playlists and keeping the file in sync

The second part of issue 129. The reading side is in [playlist-import.md](playlist-import.md).

## Export

The Export button of a playlist (`PLAYLIST_EXPORT`) opens a save dialog; the format is the one of the extension that is chosen (`.m3u8`, `.m3u`, `.pls`, `.xspf`, `playlistExportFilters`). `format-playlist.ts` makes the text, `export-playlist.ts` writes it. The playlist is not tied to the file by an export.

- **Locations**: a track inside the folder of the file is written relative to it, with `/` on every system; any other is written as the library has it (an absolute path with `/`). XSPF writes the same as a relative reference or a `file:` URI (`file:///C:/Music/a.flac` for a drive, `file://host/share/a.flac` for a share).
- **What is written of a track**: the title, artist, album and duration of the snapshot of the entry. A line break in a title is a space.
- **Encoding** (`encode-playlist.ts`): `.m3u8`, `.pls` and `.xspf` are UTF-8 without a byte order mark. An `.m3u` is written in the encoding the file was read with when that is a single byte one (`windows-125x`, `macintosh`) that has every character of the text, and any text of ASCII only. The encodings of more than one byte (Shift JIS, EUC-KR, GBK) and UTF-16 are not written; see below for what happens then.

## Keeping a file in sync

A playlist that was imported from a file has the checkbox "Keep file in sync" (`playlists.source_sync`, on for every playlist that has a file and off in the checkbox when the user turns it off, migration 019). With it on, every change of the playlist (a rename, an added, removed or moved entry) writes the file (`writeBackPlaylist`), and turning it on writes it at once. A playlist that was made in the app or exported has no file and no checkbox.

- **Atomic**: the bytes go to `<file>.<uuid>.tmp` beside the file and are renamed over it (`write-playlist-file.ts`), so a reader sees the old or the new file and a failed write leaves the old one.
- **Backup**: the first write over a file keeps the old one as `<file>.bak` (`COPYFILE_EXCL`, an existing `.bak` is never replaced).
- **Not read again**: after the write the checksum, modification time and encoding of what was written are stored, so the next scan finds the file unchanged and does not import the app's own write. An edit of the file by anything else changes the checksum and the file wins, as in the import.
- **A failed write** (a folder that is read only, a drive that is gone) shows a system notification with the file and the reason (`handle-write-failure.ts`); the change stays in the app and the file is as it was.
- **Characters that do not fit**: an `.m3u` is written in the encoding it was read with, and a `?` is never written. When the text has a character that encoding does not have (also for an encoding that is not written at all, like Shift JIS), the user is asked: "Write as .m3u8" writes `<name>.m3u8` beside the file, links the playlist to it and keeps the old file as `.bak` (it is not left in place, as the scan would import it again; a name that is taken fails with the notification), and "Keep the file" leaves it and turns the sync of the playlist off so the question does not come at every change.

## Not built yet

The choice of the encoding by the user, and one step back from a re-import.
