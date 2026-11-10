# Supported formats

The library scan keeps the files whose extension is in `supportedFormats` of `electron/utils/is-supported.ts`: `flac`, `mp3`, `wav`, `aac`, `ogg` (also `oga`), `opus`, the MP4 family (`m4a`, `m4b`, `m4r`) and `ape`.

These are the formats that Chromium plays in an `<audio>` element and decodes with `decodeAudioData`. The list is what the player can play, so a file the player cannot open is not in the library.

Formats that were in the list and are not played, checked in Electron 44 with generated files and with files of a real library:

- `wma`, `asf`, `wmv`, `aif`, `aiff`, `aifc`, `mp2`, `m2a`, `wv` and `wvp` (`ape` is decoded by the proxy, below): `<audio>` fails with `MEDIA_ERR_SRC_NOT_SUPPORTED`, `decodeAudioData` with `EncodingError`.
- `m4p` (protected by FairPlay, which Chromium cannot decrypt), `3gp` (AMR audio, which Chromium does not play on desktop), `ogx` (Ogg that may hold Speex or Theora) and the video containers `mp4`, `m4v` and `ogv`, which hold films and clips, not music (this is an audio player). They are out of the list until the decoder proxy of issue 302 plays them.
- ALAC in an `.m4a` is not decoded by Chromium, and plays through the decoder proxy ([decoder-proxy.md](decoder-proxy.md)), which decodes it with ffmpeg to a WAV file first.
- Monkey's Audio (`.ape`, told apart by the codec `MONKEY'S`, the first word that `read-audio-format.ts` keeps) plays the same way, decoded with ffmpeg to WAV first. The high compression levels decode slowest, so the first play of a long file waits for the whole decode ([decoder-proxy.md](decoder-proxy.md)).
- AC-3, Speex and Theora (video) in a container that has a supported extension (`.m4a`, `.ogg`) are not decoded. They are told apart by the `codec` read from the file (`isSupportedCodec`), so the scan does not store them, and a rescan removes one that an earlier version stored. A folder with such files is read again by each scan of that folder, as nothing is stored to tell that the file is unchanged.

A track of a format or codec that left the list is removed from the library by the next rescan (`removeMissingTracks` in `electron/library/scan/rescan-library.ts`), together with the tracks whose file is gone. The file itself is not touched.

Before a format is added, test it with `<audio>` and `decodeAudioData` in the app, not with `canPlayType`, which answers an empty string for formats that play.
