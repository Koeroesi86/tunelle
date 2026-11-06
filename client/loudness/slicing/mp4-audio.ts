import { aacSampleRates } from './adts';
import { childOf, childrenOf, mustChild } from './mp4-boxes';
import type { Box } from './mp4-boxes';
import { NotSliceable } from './types';

/** What the AAC stream of the file says of itself, which each frame of an ADTS stream says again */
export interface AacConfig {
  sampleRateIndex: number;
  channels: number;
}

/** The size of a descriptor: 7 bits of each byte, the high bit says that another byte follows */
const lengthAt = (bytes: Uint8Array, offset: number, value = 0): { length: number; next: number } =>
  (bytes[offset] & 0x80) === 0
    ? { length: (value << 7) | bytes[offset], next: offset + 1 }
    : lengthAt(bytes, offset + 1, (value << 7) | (bytes[offset] & 0x7f));

const descriptorAt = (bytes: Uint8Array, offset: number, tag: number) => {
  if (bytes[offset] !== tag) throw new NotSliceable('An MP4 file with an audio description that is not what AAC has');
  const { length, next } = lengthAt(bytes, offset + 1);
  return { start: next, end: next + length };
};

/** Where the descriptors inside an ES descriptor start: 3 bytes, then what its flags say follows */
const afterEsFields = (bytes: Uint8Array, start: number) => {
  const flags = bytes[start + 2];
  const url = flags & 0x40 ? 1 + bytes[start + 3 + (flags & 0x80 ? 2 : 0)] : 0;
  return start + 3 + (flags & 0x80 ? 2 : 0) + url + (flags & 0x20 ? 2 : 0);
};

/** The AudioSpecificConfig in the `esds` box: ES descriptor, decoder configuration (13 bytes) and the decoder specific information */
const specificInfo = (bytes: Uint8Array, esds: Box) => {
  const es = descriptorAt(bytes, esds.start + 4, 3);
  const config = descriptorAt(bytes, afterEsFields(bytes, es.start), 4);
  if (bytes[config.start] !== 0x40) throw new NotSliceable('An MP4 file with a codec that is not MPEG-4 AAC');
  const info = descriptorAt(bytes, config.start + 13, 5);
  return bytes.subarray(info.start, info.end);
};

/** The AAC of the sample description of a track: low complexity only, as the ones with SBR or PS (HE-AAC) say what they are in a way an ADTS stream cannot */
export const aacConfigOf = (bytes: Uint8Array, description: Box): AacConfig => {
  const entry = childrenOf(bytes, description, description.start + 8)[0];
  // the entry of a sound track: its fields take 28 bytes of the content, the boxes follow
  const esds = entry?.type === 'mp4a' && bytes[entry.start + 8] === 0 ? childOf(bytes, { ...entry, start: entry.start + 28 }, 'esds') : undefined;
  if (!esds) throw new NotSliceable('An MP4 file whose audio is not AAC');

  const [first, second] = specificInfo(bytes, esds);
  const config = { sampleRateIndex: ((first & 7) << 1) | (second >> 7), channels: (second >> 3) & 15 };
  const isSupported = first >> 3 === 2 && config.sampleRateIndex < aacSampleRates.length && config.channels >= 1 && config.channels <= 7;
  if (!isSupported) throw new NotSliceable('An MP4 file with AAC that is not low complexity, or whose layout is not told by a number');
  return config;
};

const handlerOf = (bytes: Uint8Array, track: Box) => {
  const handler = mustChild(bytes, mustChild(bytes, track, 'mdia'), 'hdlr');
  return String.fromCharCode(...bytes.subarray(handler.start + 8, handler.start + 12));
};

/** The first track that carries sound, with the table of its samples */
export const audioTrackOf = (bytes: Uint8Array, moov: Box) => {
  if (childOf(bytes, moov, 'mvex')) throw new NotSliceable('An MP4 file in fragments');
  const track = childrenOf(bytes, moov).find((box) => box.type === 'trak' && handlerOf(bytes, box) === 'soun');
  if (!track) throw new NotSliceable('An MP4 file without a track of sound');
  return mustChild(bytes, mustChild(bytes, mustChild(bytes, track, 'mdia'), 'minf'), 'stbl');
};
