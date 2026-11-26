import { describe, expect, it } from 'vitest';
import { completeStreamFormat, detectStreamFormat } from './stream-format';

/** `fLaC`, a block header and the STREAMINFO of 96 kHz stereo at the depth */
const streamInfo = (depth: number) => {
  const block = Buffer.alloc(34);
  block.writeUInt32BE(((96000 << 12) | (1 << 9) | ((depth - 1) << 4)) >>> 0, 10);
  return Buffer.concat([Buffer.from('fLaC'), Buffer.from([0x80, 0, 0, 34]), block]);
};

/** The first page of an Ogg FLAC stream, whose packet holds the same STREAMINFO */
const ogg = (depth: number) => {
  const packet = Buffer.concat([Buffer.from([0x7f]), Buffer.from('FLAC'), Buffer.from([1, 0, 0, 1]), streamInfo(depth)]);
  const header = Buffer.alloc(28);
  header.write('OggS');
  header[26] = 1;
  header[27] = packet.length;
  return Buffer.concat([header, packet]);
};

describe('detectStreamFormat', () => {
  it.each([16, 24, 32])('reads a depth of %s bit from a native and an Ogg FLAC stream', (depth) => {
    expect(detectStreamFormat(streamInfo(depth))).toEqual({ codec: 'FLAC', bitDepth: depth });
    expect(detectStreamFormat(ogg(depth))).toEqual({ codec: 'FLAC', bitDepth: depth });
  });

  it('names a FLAC stream whose depth has not arrived, without a depth', () => {
    expect(detectStreamFormat(streamInfo(24).subarray(0, 12))).toEqual({ codec: 'FLAC', bitDepth: null });
  });

  it('knows nothing of bytes that are no audio', () => {
    expect(detectStreamFormat(Buffer.from('not audio'))).toBeUndefined();
  });
});

describe('completeStreamFormat', () => {
  it('waits for the depth of a FLAC stream', () => {
    expect(completeStreamFormat(streamInfo(24).subarray(0, 12))).toBeUndefined();
    expect(completeStreamFormat(streamInfo(24))).toEqual({ codec: 'FLAC', bitDepth: 24 });
  });
});
