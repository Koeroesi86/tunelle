/** The types that the desktop entries list, so a file manager and the default applications offer the app for them; they match the formats of `electron/utils/is-supported.ts`. See docs/app/open-files.md */
const audioMimeTypes = [
  'audio/flac',
  'audio/x-flac',
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/x-vorbis+ogg',
  'audio/opus',
  'audio/x-opus+ogg',
  'audio/vnd.wave',
  'audio/wav',
  'audio/x-wav',
  'audio/x-ape',
  'audio/x-wavpack',
  'audio/x-aiff',
  'audio/aiff',
  'audio/x-ms-wma',
];

/** The value of the `MimeType` key */
export const mimeTypeEntry = `${audioMimeTypes.join(';')};`;
