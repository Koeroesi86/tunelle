const singleByteEncoding = /^(windows-125\d|macintosh)$/;
const ascii = /^[\x00-\x7f]*$/;

/** The bytes of each character that a single byte encoding has, found by reading the 256 bytes with it */
const byteOfCharacter = (encoding: string) => {
  const decoder = new TextDecoder(encoding);
  return new Map(Array.from({ length: 256 }, (_, byte) => [decoder.decode(Uint8Array.of(byte)), byte] as const).reverse());
};

/** The text as bytes in the encoding that is wanted (UTF-8 without a byte order mark when none is): a single byte encoding is written when it has every character of the text, and a text of ASCII only is the same in any of them. Undefined when the text does not fit, nothing is replaced by a `?`. See docs/app/playlist-export.md */
export const encodePlaylist = (text: string, wanted = 'utf-8') => {
  if (wanted === 'utf-8' || ascii.test(text)) return { buffer: Buffer.from(text, 'utf-8'), encoding: wanted };

  const legacy = singleByteEncoding.test(wanted) ? byteOfCharacter(wanted) : undefined;
  const bytes = Array.from(text, (character) => legacy?.get(character));

  return legacy && bytes.every((byte) => byte !== undefined) ? { buffer: Buffer.from(bytes), encoding: wanted } : undefined;
};
