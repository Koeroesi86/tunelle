# Importing playlist files

Playlist files (`.m3u`, `.m3u8`, `.pls`, `.xspf`) become playlists of the app, in two ways that share one code path (`electron/library/playlists/import-playlist-files.ts`): the scan of a library folder finds them, and the arrow button next to the plus of the playlists in the sidebar (`PLAYLIST_IMPORT`) opens a file dialog for files anywhere. The decisions are in issue 129.

## What is read

- **M3U and M3U8** (`parse-m3u.ts`): a line is a location, `#EXTINF:<seconds>,<artist> - <title>` and `#PLAYLIST:<name>` are read, other comments are skipped.
- **PLS** (`parse-pls.ts`): the `FileN`, `TitleN` and `LengthN` keys, in the order of `N`.
- **XSPF** (`parse-xspf.ts`): `location` (a URI), `title`, `creator`, `album` and `duration` (milliseconds) of each `track`, and the `title` of the playlist. It is read with a small tokenizer, not an XML parser, so a file that is not well formed still gives the tracks that can be read.

## Encoding

`decode-playlist.ts` takes the byte order mark when there is one, else UTF-8 when the bytes are valid UTF-8, else the legacy encoding of the system: the Windows code page of the language (`windows-1250` for Polish, Czech, Hungarian and others, `windows-1251` for Cyrillic, 1253 to 1258 for Greek, Turkish, Hebrew, Arabic, the Baltic languages and Vietnamese, Shift JIS, EUC-KR and GBK), and `macintosh` (Mac Roman) on a Mac and `windows-1252` elsewhere for the rest. The one that was used is stored in `playlists.source_encoding`. A choice of the encoding by the user is not built yet.

## Matching the library

The library stores paths with forward slashes on every system (`normalizePath`). A location is turned into such a path (`resolve-location.ts`: `file:` URIs are decoded, backslashes become slashes, a relative path is taken from the folder of the playlist file), then looked up in the library (`library-index.ts`):

1. the same path (composed Unicode, as macOS stores file names decomposed);
2. the same path without regard to the case, when only one file is that;
3. the one file that has the same name and shares the longest tail of its path with the location, which finds `C:\Music\Artist\Album\01.flac` of a Windows playlist at `/home/me/Music/Artist/Album/01.flac`. A name that is ambiguous at the longest tail is not matched.

A location that is not found stays in the playlist as an entry that is not available, shown from what the file says of it (title, artist, album), and is listed in the report that the window shows. It is not looked up again until the file changes, so it does not become a track of the library by itself when the file is added later; importing the changed file does. An address on the network (`http://`) is skipped and counted in the report, as a playlist keeps only the tracks of the library.

## One playlist for a file, and when it changes

`playlists.source_path` (the path of the file, unique), `source_checksum` (SHA-256 of the bytes), `source_mtime` and `source_encoding` link the playlist to its file (migration 018). The name of the playlist is the `title` of the file, or its name without the extension; a name that is taken gets the name of the folder, then a number.

A scan reads a file again only when its modification time is not the stored one, and does nothing when the checksum is the stored one. A changed checksum replaces the entries with what the file says: the file wins over what was done to the playlist in the app. The name stays as the user has it. A rescan that looks at changed folders sees an added, removed or renamed file (the time of the folder changes), not an edit in place, which the complete rescan of the settings sees.

## When the file or the folder goes

- A playlist whose file is gone from a folder that the scan could list is removed with it. A folder that is offline is not scanned, so its playlists stay.
- When a folder leaves the library, the playlists of its files that have no track left in the library are removed (`settlePlaylistsOfRemovedFolder`), the others stay as playlists of the app and lose the link to the file.

## Not built yet

Export and writing changes back to the file are in [playlist-export.md](playlist-export.md). The choice of the encoding by the user and a way to go back to the entries before a re-import are not built yet.
