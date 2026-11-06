import { describe, expect, it } from 'vitest';
import { sliceWav } from './slice-wav';
import { collect, join } from './memory-reader';

const ascii = (text: string) => Uint8Array.from([...text].map((letter) => letter.charCodeAt(0)));
const u32 = (value: number) => Uint8Array.from([value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255]);
const u16 = (value: number) => Uint8Array.from([value & 255, value >> 8]);

/** A stereo 16 bit WAV file of `frames` samples, with a LIST chunk (of an odd length) before the sound, as taggers write it */
const wav = (frames: number, dataLength = frames * 4) => {
  const format = join(ascii('fmt '), u32(16), u16(1), u16(2), u32(44100), u32(176400), u16(4), u16(16));
  const list = join(ascii('LIST'), u32(3), Uint8Array.from([1, 2, 3, 0]));
  const sound = Uint8Array.from({ length: frames * 4 }, (_, index) => index % 251);
  return { file: join(ascii('RIFF'), u32(0), ascii('WAVE'), format, list, ascii('data'), u32(dataLength), sound), sound };
};

const soundOf = (piece: Uint8Array) => piece.subarray(44);

describe('sliceWav', () => {
  it('cuts the sound at whole samples, each piece a WAV file of its own with the format of the file', async () => {
    const { file, sound } = wav(1000);

    const slices = await collect(sliceWav, file, 1001);

    expect(slices.length).toBeGreaterThan(3);
    slices.forEach(({ bytes, skip }) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
      expect(view.getUint32(4, true)).toBe(bytes.length - 8);
      expect(view.getUint32(40, true)).toBe(soundOf(bytes).length);
      expect(view.getUint16(32, true)).toBe(4);
      expect(soundOf(bytes).length % 4).toBe(0);
      expect(skip).toBe(0);
    });
    expect(join(...slices.map(({ bytes }) => soundOf(bytes)))).toEqual(sound);
  });

  it('takes the sound to the end of the file when the header does not know its length', async () => {
    const { file, sound } = wav(500, 0);

    const slices = await collect(sliceWav, file, 4000);

    expect(join(...slices.map(({ bytes }) => soundOf(bytes)))).toEqual(sound);
  });

  it('rejects a file that is not a WAV file with sound', async () => {
    await expect(collect(sliceWav, ascii('RIFF....WAVE'), 100)).rejects.toThrow('without sound');
  });
});
