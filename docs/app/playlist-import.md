# Importing playlist files

Playlist files (`.m3u`, `.m3u8`, `.pls`, `.xspf`) become playlists of the app, in two ways that share one code path (`electron/library/playlists/import-export/import-playlist-files.ts`): the scan of a library folder finds them, and the arrow button next to the plus of the playlists in the sidebar (`PLAYLIST_IMPORT`) opens a file dialog for files anywhere. The decisions are in issue 129.

## What is read

- **M3U and M3U8** (`parse-m3u.ts`): a line is a location, `#EXTINF:<seconds>,<artist> - <title>` and `#PLAYLIST:<name>` are read, other comments are skipped.
- **PLS** (`parse-pls.ts`): the `FileN`, `TitleN` and `LengthN` keys, in the order of `N`.
- **XSPF** (`parse-xspf.ts`): `location` (a URI), `title`, `creator`, `album` and `duration` (milliseconds) of each `track`, and the `title` of the playlist. It is read with a small tokenizer, not an XML parser, so a file that is not well formed still gives the tracks that can be read.

## Encoding

`decode-playlist.ts` takes the byte order mark when there is one, else UTF-8 when the bytes are valid UTF-8, else the legacy encoding of the system: the Windows code page of the language (`windows-1250` for Polish, Czech, Hungarian and others, `windows-1251` for Cyrillic, 1253 to 1258 for Greek, Turkish, Hebrew, Arabic, the Baltic languages and Vietnamese, Shift JIS, EUC-KR and GBK), and `macintosh` (Mac Roman) on a Mac and `windows-1252` elsewhere for the rest. The one that was used is stored in `playlists.source_encoding`.

The user can choose the encoding of a playlist that has a file (the "Encoding" list of the playlist, `playlistEncodings` in `shared/schemas/playlists.ts`: UTF-8, UTF-16, the Windows code pages 1250 to 1258, Mac Roman, Shift JIS, EUC-KR and GBK), for a file whose letters with accents come out wrong. The choice is stored in `playlists.source_encoding_override` (migration 020) and the file is read again at once (`reimportPlaylistFile`, which reads a file whether it changed or not). The choice is used for every read of the file after it, also when the file changes, until "Detected" is chosen again; a write back is not changed by it (an `.m3u` is written in the encoding it was read with).

## Matching the library

The library stores paths with forward slashes on every system (`normalizePath`). A location is turned into such a path (`resolve-location.ts`: `file:` URIs are decoded, backslashes become slashes, a relative path is taken from the folder of the playlist file), then looked up in the library (`library-index.ts`):

1. the same path (composed Unicode, as macOS stores file names decomposed);
2. the same path without regard to the case, when only one file is that;
3. the one file that has the same name and shares the longest tail of its path with the location, which finds `C:\Music\Artist\Album\01.flac` of a Windows playlist at `/home/me/Music/Artist/Album/01.flac`. A name that is ambiguous at the longest tail is not matched.

A location that is not found stays in the playlist as an entry that is not available, shown from what the file says of it (title, artist, album), and is listed in the report that the window shows. The entry is stored with the path of the location, so when the library has a file at that path later, the entry is that track: the window shows what the library has of it and not the title the file said (`send-playlists.ts`). An address on the network (`http://`) is skipped and counted in the report: the player plays the files of the library, so a playlist keeps only those and an entry with an address would be one that cannot play.

## One playlist for a file, and when it changes

`playlists.source_path` (the path of the file, unique), `source_checksum` (SHA-256 of the bytes), `source_mtime` and `source_encoding` link the playlist to its file (migration 018). The name of the playlist is the `title` of the file, or its name without the extension; a name that is taken gets the name of the folder, then a number.

A scan reads a file again only when its modification time is not the stored one, and does nothing when the checksum is the stored one. A changed checksum replaces the entries with what the file says: the file wins over what was done to the playlist in the app. The name stays as the user has it. The entries that a read replaces are kept in `playlists.previous_entries`, and "Undo re-read" of the playlist (`undoImport`) brings them back, once (a second read keeps only the entries of the one before it). With the sync on the file is written to match, with it off the file keeps what it says and the playlist differs from it until the file changes.

A rescan that looks at changed folders sees an added, removed or renamed file (the time of the folder changes), not an edit in place, which the complete rescan of the settings sees.

## When the file or the folder goes

- A playlist whose file is gone from a folder that the scan could list is removed with it. A folder that is offline is not scanned, so its playlists stay.
- When a folder leaves the library, the playlists of its files that have no track left in the library are removed (`settlePlaylistsOfRemovedFolder`), the others stay as playlists of the app and lose the link to the file.

## Export

Export and writing changes back to the file are in [playlist-export.md](playlist-export.md).

## Deleting a playlist that has a file

Deleting a playlist removes it from the app and not its file, so the next scan or the folder watcher makes the playlist again from the file. A playlist with a file asks in the dialog of the app (`Confirm`, as the clearing of the history does) with the name, the file, and that the playlist comes back at the next scan while the file stays, so delete the file too to keep it away; "Yes" deletes the playlist only, "Delete playlist and file" deletes the file too, and "No" keeps both. The file goes the way a replaced one does: what is in it is kept as `<file>.bak` first (`retirePlaylistFile`, never over an earlier `.bak`), and a file that cannot be removed is logged and leaves the playlist as it is. The main process takes the path of the file from its own record of the playlist, not from the message of the window. A playlist without a file asks with two clicks on the button ("Delete playlist", then "Delete for good"). Without that choice the file stays. The app does not remember that a playlist was deleted (that would need a table of ignored files and a migration).
