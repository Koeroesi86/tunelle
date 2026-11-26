import { describe, expect, it } from 'vitest';
import { wavHeader, wavHeaderSize, wavSize } from './wav-header';

const stereo24 = { channels: 2, sampleRate: 96000, bytesPerSample: 3, frames: 1000 };

describe('wavSize', () => {
  it('is the header and the samples', () => {
    expect(wavSize(stereo24)).toBe(44 + 1000 * 2 * 3);
  });

  /** The most frames of 4 bytes whose RIFF size still fits in 32 bit */
  const lastSmall = Math.floor((0xffffffff - 36) / 4);

  it.each([
    ['the largest file of 32 bit sizes', lastSmall, 44],
    ['a file of one frame more, which is RF64', lastSmall + 1, 80],
  ])('has the header of %s', (_name, frames, headerSize) => {
    const layout = { channels: 2, sampleRate: 44100, bytesPerSample: 2, frames };

    expect(wavHeaderSize(layout)).toBe(headerSize);
    expect(wavHeader(layout)).toHaveLength(headerSize);
    expect(wavSize(layout)).toBe(headerSize + frames * 4);
  });
});

describe('wavHeader', () => {
  it('describes a PCM file of the layout, with the sizes of the whole file', () => {
    const header = wavHeader(stereo24);

    expect(header).toHaveLength(44);
    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
    expect(header.readUInt32LE(4)).toBe(wavSize(stereo24) - 8);
    expect(header.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(header.readUInt16LE(20)).toBe(1);
    expect(header.readUInt16LE(22)).toBe(2);
    expect(header.readUInt32LE(24)).toBe(96000);
    expect(header.readUInt32LE(28)).toBe(96000 * 2 * 3);
    expect(header.readUInt16LE(32)).toBe(6);
    expect(header.readUInt16LE(34)).toBe(24);
    expect(header.toString('ascii', 36, 40)).toBe('data');
    expect(header.readUInt32LE(40)).toBe(6000);
  });

  it('marks float samples as IEEE float', () => {
    const header = wavHeader({ ...stereo24, bytesPerSample: 4, float: true });

    expect(header.readUInt16LE(20)).toBe(3);
    expect(header.readUInt16LE(34)).toBe(32);
  });

  it('writes the 64 bit sizes of a file over 4 GiB in ds64', () => {
    const layout = { channels: 2, sampleRate: 88200, bytesPerSample: 3, frames: 1_000_000_000 };
    const header = wavHeader(layout);

    expect(header.toString('ascii', 0, 4)).toBe('RF64');
    expect(header.readUInt32LE(4)).toBe(0xffffffff);
    expect(header.toString('ascii', 8, 16)).toBe('WAVEds64');
    expect(header.readUInt32LE(16)).toBe(28);
    expect(header.readBigUInt64LE(20)).toBe(6_000_000_072n);
    expect(header.readBigUInt64LE(28)).toBe(6_000_000_000n);
    expect(header.readBigUInt64LE(36)).toBe(1_000_000_000n);
    expect(header.readUInt32LE(44)).toBe(0);
    expect(header.toString('ascii', 48, 52)).toBe('fmt ');
    expect(header.readUInt16LE(70)).toBe(24);
    expect(header.toString('ascii', 72, 76)).toBe('data');
    expect(header.readUInt32LE(76)).toBe(0xffffffff);
  });
});
