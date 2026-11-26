# Supported formats

The library scan keeps the files whose extension is in `supportedFormats` of `electron/utils/is-supported.ts`: `flac`, `mp3`, `wav`, `aac`, `ogg` (also `oga`), `opus`, the MP4 family (`m4a`, `m4b`, `m4r`), `mp2`, `ape`, `wv`, `aif`, `aiff`, `aifc`, `dsf`, `dff`, `wma`, `asf`, `mka`, `weba`, `w64` and `caf`.

These are the formats that Chromium plays in an `<audio>` element and decodes with `decodeAudioData`. The list is what the player can play, so a file the player cannot open is not in the library.

Formats that were in the list and are not played, checked in Electron 44 with generated files and with files of a real library:

- `wmv`, `m2a` and `wvp` (`ape`, `wv`, `aif`, `aiff`, `aifc`, `dsf`, `dff`, `wma` and `asf` are [decoded by the proxy](decoded-formats.md)): `<audio>` fails with `MEDIA_ERR_SRC_NOT_SUPPORTED`, `decodeAudioData` with `EncodingError`.
- `m4p` (protected by FairPlay, which Chromium cannot decrypt), `3gp` (AMR audio, which Chromium does not play on desktop), `ogx` (Ogg that may hold Speex or Theora) and the video containers `mp4`, `m4v` and `ogv`, which hold films and clips, not music (this is an audio player). They are out of the list until the decoder proxy of issue 302 plays them.
- Speex and Theora (video) in a container that has a supported extension (`.m4a`, `.ogg`) are not decoded. They are told apart by the `codec` read from the file (`isSupportedCodec`), so the scan does not store them, and a rescan removes one that an earlier version stored. A folder with such files is read again by each scan of that folder, as nothing is stored to tell that the file is unchanged.

A track of a format or codec that left the list is removed from the library by the next rescan (`removeMissingTracks` in `electron/library/scan/rescan-library.ts`), together with the tracks whose file is gone. The file itself is not touched.

Before a format is added, test it with `<audio>` and `decodeAudioData` in the app, not with `canPlayType`, which answers an empty string for formats that play.

More: [formats the bundled ffmpeg decodes](decoded-formats.md).
