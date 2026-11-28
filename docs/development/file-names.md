# File names with signs

A file can be named `#1 100%.flac`, and a name goes through many forms on its way to the sound: a path in the database, an address of the page (`tunelle://app/track?path=…`), a `file:` address for Electron, a line of a playlist file. Each form has signs of its own, and a name that is not encoded or decoded exactly once is not found.

## The names the tests use

`shared/test-unusual-names.ts` lists them: `#`, `%`, text that looks encoded (`%20`), accents as one and as two characters (the two Unicode forms), emoji, and the signs of addresses and patterns. A new name goes into that list, and every tier runs it. Each name is valid on every system.

| Where a name is turned into something else | Test |
| --- | --- |
| the address of a track in the page (`track-source.ts`) | `track-source.test.ts` |
| the path read from that address | `tunelle-protocol.test.ts` |
| the `file:` address given to Electron (`serve-file.ts`) | `serve-file.test.ts` |
| a file the system opens, as a path or a `file:` address | `opened-files.test.ts` |
| each playlist format, written and read back | `playlist-file-names.test.ts` |
| real files: the scan, SQLite, the protocol and ffmpeg | `scan-folder.file-names.integration.test.ts` |
| the `net.fetch` of Electron, which the lower tiers replace | `e2e/functional/file-names.spec.ts`, one file |

- macOS takes the two forms of an accent as one file name, so a test that makes both on disk gives each a folder of its own.
- The app decodes FLAC to WAV before it serves it. To check that a file goes out as it is, use a format that Chromium plays (AAC).

## What went wrong in playlist files

Found with these names; the app could not read back some of what it wrote.

| Symptom | Cause | Now |
| --- | --- | --- |
| tracks of an XSPF file with spaces, accents, `#` or `%` in a relative location are not found, also after an export of the app | the location of XSPF is a URI, and only `file:` addresses were decoded | `parse-xspf.ts` decodes a location that has no scheme |
| a track is missing after an export to M3U | a relative location that starts with `#` reads as a comment | `format-playlist.ts` writes it from `./` |
| a whole playlist file is not imported | `decodeURIComponent` throws on a `%` that starts no sequence, as in `file:///music/100%.flac` | `decode-percent.ts` leaves such a `%` as it is |

A playlist that was imported from a relative XSPF file before this is read again when the file changes, or when its encoding is chosen again ([importing](../app/playlist-import.md)).

Check: `npx vitest run electron/library/playlists`.
