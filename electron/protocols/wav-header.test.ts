import { describe, expect, it } from 'vitest';
import { wavHeader, wavSize } from './wav-header';

const stereo24 = { channels: 2, sampleRate: 96000, bytesPerSample: 3, frames: 1000 };

describe('wavSize', () => {
  it('is the header and the samples', () => {
    expect(wavSize(stereo24)).toBe(44 + 1000 * 2 * 3);
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
});
