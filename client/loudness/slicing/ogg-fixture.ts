import { join } from './memory-reader';

/** A page of an Ogg stream with the header fields that a cut reads; the CRC is not looked at */
export const page = (serial: number, sequence: number, granule: number | undefined, body: Uint8Array, flags = 0) => {
  const segments = Array.from({ length: Math.floor(body.length / 255) + 1 }, (_, index) => (index < Math.floor(body.length / 255) ? 255 : body.length % 255));
  const header = new Uint8Array(27 + segments.length);
  const data = new DataView(header.buffer);
  header.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);
  data.setUint32(6, granule === undefined ? 0xffffffff : granule % 2 ** 32, true);
  data.setUint32(10, granule === undefined ? 0xffffffff : Math.floor(granule / 2 ** 32), true);
  data.setUint32(14, serial, true);
  data.setUint32(18, sequence, true);
  header[26] = segments.length;
  header.set(segments, 27);
  return join(header, body);
};

const text = (value: string) => Uint8Array.from([...value].map((letter) => letter.charCodeAt(0)));

/** The packets that start an Opus stream, and the ones of a Vorbis stream at 44.1 kHz */
export const opusHead = join(text('OpusHead'), Uint8Array.from([1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]));
export const vorbisIdentification = join(text('\u0001vorbis'), Uint8Array.from([0, 0, 0, 0, 2, 0x44, 0xac, 0, 0]));
