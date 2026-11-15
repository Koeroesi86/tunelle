const utf8 = new TextDecoder('utf-8', { fatal: true });

/** The legacy code page that a system with this language wrote its playlists in, the Western one for the rest */
const codePageOfLanguage: Record<string, string> = {
  ru: 'windows-1251',
  uk: 'windows-1251',
  bg: 'windows-1251',
  sr: 'windows-1251',
  be: 'windows-1251',
  mk: 'windows-1251',
  pl: 'windows-1250',
  cs: 'windows-1250',
  sk: 'windows-1250',
  hu: 'windows-1250',
  ro: 'windows-1250',
  hr: 'windows-1250',
  sl: 'windows-1250',
  el: 'windows-1253',
  tr: 'windows-1254',
  he: 'windows-1255',
  ar: 'windows-1256',
  fa: 'windows-1256',
  et: 'windows-1257',
  lv: 'windows-1257',
  lt: 'windows-1257',
  vi: 'windows-1258',
  ja: 'shift_jis',
  ko: 'euc-kr',
  zh: 'gbk',
};

/** What a text that is not UTF-8 is read as unless the user chose: the code page of the language of the system, and the Mac Roman of a Mac for the Western languages. See docs/app/playlist-import.md */
export const guessLegacyEncoding = (language = Intl.DateTimeFormat().resolvedOptions().locale, platform = process.platform) => {
  const codePage = codePageOfLanguage[language.toLowerCase().split(/[-_]/)[0] ?? ''];
  if (codePage) return codePage;
  return platform === 'darwin' ? 'macintosh' : 'windows-1252';
};

const byteOrderMarks = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be' },
];

const readBom = (buffer: Buffer) => byteOrderMarks.find(({ bytes }) => bytes.every((byte, index) => buffer[index] === byte))?.encoding;

const isValidUtf8 = (buffer: Buffer) => {
  try {
    utf8.decode(buffer);
    return true;
  } catch {
    return false;
  }
};

/** The encoding of a playlist file: the byte order mark, else UTF-8 when the bytes are valid UTF-8, else the legacy encoding of the system */
const detectEncoding = (buffer: Buffer) => readBom(buffer) ?? (isValidUtf8(buffer) ? 'utf-8' : guessLegacyEncoding());

/** The text of a playlist file and the encoding it was read with; the byte order mark is left out of the text */
export const decodePlaylist = (buffer: Buffer) => {
  const encoding = detectEncoding(buffer);
  return { text: new TextDecoder(encoding).decode(buffer), encoding };
};
