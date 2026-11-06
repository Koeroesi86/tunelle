import { framesSlicer } from './slice-frames';
import type { Frame } from './slice-frames';

/** Bitrates of Layer III in kbit/s, for MPEG 1 and for MPEG 2 and 2.5, by the index of the header (0 is free, 15 is not allowed) */
const bitrates = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const sampleRates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** The length and the duration of the frame whose header is at `offset`, undefined where there is no header of a Layer III frame */
const frameAt = (bytes: Uint8Array, offset: number): Frame | undefined => {
  const [first, second, third] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]];
  if (first !== 0xff || (second & 0xe0) !== 0xe0 || ((second >> 1) & 3) !== 1) return undefined;
  const version = (second >> 3) & 3;
  const rates = sampleRates[version === 3 ? 3 : version === 2 ? 2 : 0];
  const bitrate = (version === 3 ? bitrates.mpeg1 : bitrates.mpeg2)[third >> 4];
  const sampleRate = rates[(third >> 2) & 3];
  if (version === 1 || !bitrate || !sampleRate) return undefined;

  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / sampleRate) + ((third >> 1) & 1);
  return { length, seconds: samples / sampleRate };
};

/** An MP3 file is cut at the start of a frame, each piece but the first starting a few frames early, for the bit reservoir */
export const sliceMp3 = framesSlicer(frameAt, 'An MP3 file');
