import { describe, expect, it } from 'vitest';
import { slicerOf } from './slice-file';
import { sliceFlac } from './slice-flac';
import { sliceMp3 } from './slice-mp3';
import { sliceWav } from './slice-wav';
import { memoryReader } from './memory-reader';

const slicerFor = (bytes: number[]) => slicerOf(memoryReader(Uint8Array.from([...bytes, ...new Array(20).fill(0)])));
const ascii = (text: string) => [...text].map((letter) => letter.charCodeAt(0));

describe('slicerOf', () => {
  it.each([
    ['WAV', [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')], sliceWav],
    ['FLAC', ascii('fLaC'), sliceFlac],
    ['MP3 with a tag', ascii('ID3'), sliceMp3],
    ['MP3 without a tag', [0xff, 0xfb, 0x90], sliceMp3],
  ])('cuts %s', async (_, bytes, slicer) => {
    expect(await slicerFor(bytes)).toBe(slicer);
  });

  it.each([
    ['Ogg', ascii('OggS')],
    ['M4A', [0, 0, 0, 32, ...ascii('ftyp')]],
  ])('does not cut %s yet', async (_, bytes) => {
    expect(await slicerFor(bytes)).toBeUndefined();
  });
});
