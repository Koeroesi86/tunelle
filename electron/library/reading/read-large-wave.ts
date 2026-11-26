import fs from 'fs';
import type { IAudioMetadata } from 'music-metadata';
import { readBytes as read } from './read-bytes';

/** What the scan keeps of a Wave64 or RF64 file: `music-metadata` reads neither. See docs/app/decoded-formats.md */
export interface LargeWave {
  common: Partial<IAudioMetadata['common']>;
  format: {
    codec: string;
    container: string;
    lossless: boolean;
    bitsPerSample: number;
    sampleRate: number;
    bitrate: number;
    duration: number;
  };
}

interface Chunk {
  id: string;
  size: number;
}

interface Layout {
  headerLength: number;
  alignment: number;
  /** The chunk of a header, its size without the header */
  parse: (header: Buffer) => Chunk;
}

const riffMagic = 'RF64';
const w64Magic = Buffer.from('726966662e91cf11a5d628db04c10000', 'hex');

const rf64Layout: Layout = {
  headerLength: 8,
  alignment: 2,
  parse: (header) => ({ id: header.toString('latin1', 0, 4), size: header.readUInt32LE(4) }),
};

const w64Layout: Layout = {
  headerLength: 24,
  alignment: 8,
  // the GUID of a chunk starts with the four letters of its id, and its size counts the header
  parse: (header) => ({ id: header.toString('latin1', 0, 4), size: Number(header.readBigUInt64LE(16)) - 24 }),
};

/** The ids of the LIST/INFO chunk and the tags they hold */
const infoTags: Record<string, 'artist' | 'title' | 'album' | 'year' | 'genre' | 'track'> = {
  IART: 'artist',
  INAM: 'title',
  IPRD: 'album',
  ICRD: 'year',
  IGNR: 'genre',
  IPRT: 'track',
  ITRK: 'track',
};

/** The format tags of `fmt `, as the names `music-metadata` gives them, and whether the codec is lossless */
const waveCodecs: Record<number, { codec: string; lossless: boolean } | undefined> = {
  1: { codec: 'PCM', lossless: true },
  2: { codec: 'ADPCM', lossless: false },
  3: { codec: 'IEEE_FLOAT', lossless: true },
  6: { codec: 'ALAW', lossless: false },
  7: { codec: 'MULAW', lossless: false },
  17: { codec: 'DVI_ADPCM', lossless: false },
};

const extensible = 0xfffe;
const unknownSize = 0xffffffff;
const maxHeaderBytes = 1 << 20;

const toText = (body: Buffer) => body.toString('utf8').replace(/\0.*$/s, '').trim();

const toInfo = (body: Buffer): Partial<IAudioMetadata['common']> => {
  const entries: [string, string][] = [];
  let at = 4;
  while (at + 8 <= body.length) {
    const size = body.readUInt32LE(at + 4);
    entries.push([body.toString('latin1', at, at + 4), toText(body.subarray(at + 8, at + 8 + size))]);
    at += 8 + size + (size % 2);
  }
  const tags = Object.fromEntries(entries.flatMap(([id, text]) => (infoTags[id] && text ? [[infoTags[id], text]] : [])));
  const track = Number.parseInt(tags.track ?? '', 10);
  const year = Number.parseInt(tags.year ?? '', 10);
  return {
    artist: tags.artist,
    title: tags.title,
    album: tags.album,
    genre: tags.genre ? [tags.genre] : undefined,
    year: Number.isNaN(year) ? undefined : year,
    track: { no: Number.isNaN(track) ? null : track, of: null },
  };
};

const toLayout = (start: Buffer) => {
  if (start.toString('latin1', 0, 4) === riffMagic) return rf64Layout;
  return start.subarray(0, 16).equals(w64Magic) ? w64Layout : undefined;
};

/** The size of the `data` chunk of an RF64 file is in `ds64` when the chunk itself says that it is too big */
const toDataSize = (size: number, ds64: Buffer | undefined) => (size === unknownSize && ds64 ? Number(ds64.readBigUInt64LE(8)) : size);

const toFormat = (fmt: Buffer, dataSize: number): LargeWave['format'] => {
  const tag = fmt.readUInt16LE(0);
  const waveCodec = waveCodecs[tag === extensible && fmt.length >= 26 ? fmt.readUInt16LE(24) : tag];
  if (!waveCodec) throw new Error(`Wave format ${tag} is not supported`);
  const byteRate = fmt.readUInt32LE(8);
  return {
    ...waveCodec,
    container: 'WAVE',
    bitsPerSample: fmt.readUInt16LE(14),
    sampleRate: fmt.readUInt32LE(4),
    bitrate: byteRate * 8,
    duration: dataSize / byteRate,
  };
};

interface Header {
  chunks: Map<string, Buffer>;
  dataSize: number | undefined;
}

/** The chunks up to `data`, which is not read: the audio follows it */
const readChunks = async (handle: fs.promises.FileHandle, layout: Layout, position: number, chunks = new Map<string, Buffer>()): Promise<Header> => {
  const header = await read(handle, layout.headerLength, position);
  if (header.length < layout.headerLength || position > maxHeaderBytes) return { chunks, dataSize: undefined };
  const { id, size } = layout.parse(header);
  if (id === 'data') return { chunks, dataSize: toDataSize(size, chunks.get('ds64')) };
  const body = size > maxHeaderBytes ? Buffer.alloc(0) : await read(handle, size, position + layout.headerLength);
  chunks.set(id === 'LIST' && body.toString('latin1', 0, 4) === 'INFO' ? 'INFO' : id, body);
  return readChunks(handle, layout, position + layout.headerLength + size + ((layout.alignment - (size % layout.alignment)) % layout.alignment), chunks);
};

const readWave = async (handle: fs.promises.FileHandle, fileName: string): Promise<LargeWave | undefined> => {
  const layout = toLayout(await read(handle, 16, 0));
  if (!layout) return undefined;
  // RIFF and WAVE of an RF64 file are 12 bytes, the ones of Wave64 are 40
  const { chunks, dataSize } = await readChunks(handle, layout, layout === rf64Layout ? 12 : 40);
  const fmt = chunks.get('fmt ');
  if (!fmt || dataSize === undefined) throw new Error(`${fileName} has no fmt or data chunk in the header`);
  return { common: toInfo(chunks.get('INFO') ?? Buffer.alloc(4)), format: toFormat(fmt, dataSize) };
};

/**
 * The format and the tags of a Wave64 file or an RF64 file (a WAV with 64 bit sizes, which `music-metadata` does not read), or undefined when the file is neither.
 * Only the header chunks are read, not the audio. See docs/app/decoded-formats.md
 */
export const readLargeWave = async (fileName: string): Promise<LargeWave | undefined> => {
  const handle = await fs.promises.open(fileName, 'r');
  try {
    return await readWave(handle, fileName);
  } finally {
    await handle.close();
  }
};
