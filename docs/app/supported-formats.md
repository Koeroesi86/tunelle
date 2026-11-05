# Supported formats

The library scan keeps the files whose extension is in `supportedFormats` of `electron/utils/is-supported.ts`: `flac`, `mp3`, `wav`, `aac`, `ogg` (also `oga`, `ogv`, `ogx`), `opus` and the MP4 family (`m4a`, `m4b`, `m4p`, `m4r`, `m4v`, `mp4`, `3gp`).

These are the formats that Chromium plays in an `<audio>` element and decodes with `decodeAudioData`. The list is what the player can play, so a file the player cannot open is not in the library.

Formats that were in the list and are not played, checked in Electron 44 with generated files and with files of a real library:

- `ape`, `wma`, `asf`, `wmv`, `aif`, `aiff`, `aifc`, `mp2`, `m2a`, `wv` and `wvp`: `<audio>` fails with `MEDIA_ERR_SRC_NOT_SUPPORTED`, `decodeAudioData` with `EncodingError`.
- ALAC in an `.m4a` file has a supported extension but not a supported codec. It is told apart by the `codec` read from the file (`isSupportedCodec`), so the scan does not store it, and a rescan removes one that an earlier version stored. A folder with ALAC files is read again by each scan of that folder, as nothing is stored to tell that the file is unchanged.

A track of a format or codec that left the list is removed from the library by the next rescan (`removeMissingTracks` in `electron/library/scan/rescan-library.ts`), together with the tracks whose file is gone. The file itself is not touched.

Before a format is added, test it with `<audio>` and `decodeAudioData` in the app, not with `canPlayType`, which answers an empty string for formats that play.
