import { describe, expect, it } from 'vitest';
import { slicerOf } from './slice-file';
import { sliceFlac } from './slice-flac';
import { sliceAdts } from './slice-adts';
import { sliceMp3 } from './slice-mp3';
import { sliceMp4 } from './slice-mp4';
import { sliceOgg } from './slice-ogg';
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
    ['AAC with ADTS headers', [0xff, 0xf1, 0x50, 0x80, 0x0a, 0x1f, 0xfc], sliceAdts],
    ['Ogg', ascii('OggS'), sliceOgg],
    ['M4A', [0, 0, 0, 32, ...ascii('ftyp')], sliceMp4],
  ])('cuts %s', async (_, bytes, slicer) => {
    expect(await slicerFor(bytes)).toBe(slicer);
  });

  it('tells AAC from MP3 behind a tag by the header of the first frame', async () => {
    const tag = [...ascii('ID3'), 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4];

    expect(await slicerFor([...tag, 0xff, 0xf1, 0x50, 0x80, 0x0a, 0x1f, 0xfc])).toBe(sliceAdts);
    expect(await slicerFor([...tag, 0xff, 0xfb, 0x90, 0x00])).toBe(sliceMp3);
  });

  it('does not cut a format that is not one of these', async () => {
    expect(await slicerFor(ascii('not a sound'))).toBeUndefined();
  });
});
