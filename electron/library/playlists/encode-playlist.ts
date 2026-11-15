const singleByteEncoding = /^(windows-125\d|macintosh)$/;

/** The bytes of each character that a single byte encoding has, found by reading the 256 bytes with it */
const byteOfCharacter = (encoding: string) => {
  const decoder = new TextDecoder(encoding);
  return new Map(Array.from({ length: 256 }, (_, byte) => [decoder.decode(Uint8Array.of(byte)), byte] as const).reverse());
};

/** The text as bytes: the legacy encoding it was read with when it is a single byte one that has every character of the text, UTF-8 (no byte order mark) otherwise. Returns the encoding that was used. See docs/app/playlist-export.md */
export const encodePlaylist = (text: string, wanted: string | undefined = undefined) => {
  const legacy = wanted !== undefined && singleByteEncoding.test(wanted) ? byteOfCharacter(wanted) : undefined;
  const bytes = legacy ? Array.from(text, (character) => legacy.get(character)) : [];

  if (legacy && bytes.every((byte) => byte !== undefined)) return { buffer: Buffer.from(bytes), encoding: wanted ?? 'utf-8' };
  return { buffer: Buffer.from(text, 'utf-8'), encoding: 'utf-8' };
};
