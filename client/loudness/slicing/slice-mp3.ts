import { findCut, cutsOf } from './find-cut';
import { SliceError } from './types';
import type { ReadRange, Slicer } from './types';

/** Bitrates of Layer III in kbit/s, for MPEG 1 and for MPEG 2 and 2.5, by the index of the header (0 is free, 15 is not allowed) */
const bitrates = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const sampleRates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

const headerBytes = 4;

/** The length and the duration of the frame whose header is at `offset`, undefined where there is no header of a Layer III frame */
const frameAt = (bytes: Uint8Array, offset: number) => {
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

/** Frames that follow each other: the header at `offset`, and the ones after it, are all headers where the length of the frame says */
const startsFrames = (bytes: Uint8Array, offset: number) => {
  let at = offset;
  for (let count = 0; count < 3; count++) {
    const frame = frameAt(bytes, at);
    if (!frame) return false;
    at += frame.length;
    // a frame that ends past the window is taken to be one
    if (at + headerBytes > bytes.length) return true;
  }
  return true;
};

/** The size of the tag at the start (ID3v2: 10 bytes of header, its size in 7 bits of 4 bytes, and a footer if the flag says) */
const tagLength = async (read: ReadRange) => {
  const head = await read(0, 10);
  if (!head) throw new SliceError('A file that could not be read');
  const isTag = head.length === 10 && String.fromCharCode(...head.subarray(0, 3)) === 'ID3';
  return isTag ? 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]) + (head[5] & 0x10 ? 10 : 0) : 0;
};

/** About two frames of the largest size, which the decoder needs of the piece before */
const leadInBytes = 3000;

/** The start of the frames before a cut that are decoded and left out, and how long they play */
const leadIn = async (read: ReadRange, cut: number, size: number) => {
  const start = (await findCut(read, Math.max(cut - leadInBytes, 0), size, startsFrames)) ?? cut;
  const bytes = (await read(start, cut)) ?? new Uint8Array();
  let seconds = 0;
  for (let offset = 0; offset < bytes.length;) {
    const frame = frameAt(bytes, offset);
    if (!frame) break;
    seconds += frame.seconds;
    offset += frame.length;
  }
  return { start, seconds };
};

/**
 * An MP3 file is cut at the start of a frame (found where three headers follow each other by their lengths). Each piece but the first starts
 * a few frames early, which the decoder needs for the bit reservoir and which are left out of what is measured
 */
export const sliceMp3: Slicer = async function* (read, size, sliceBytes) {
  const first = await findCut(read, await tagLength(read), size, startsFrames);
  if (first === undefined) throw new SliceError('An MP3 file without a frame');
  const cuts = await cutsOf(read, first, size, sliceBytes, startsFrames);

  for (let index = 0; index < cuts.length - 1; index++) {
    const lead = index === 0 ? { start: cuts[0], seconds: 0 } : await leadIn(read, cuts[index], size);
    const bytes = await read(lead.start, cuts[index + 1]);
    if (!bytes) throw new SliceError('A piece of an MP3 file could not be read');
    yield { bytes, skip: lead.seconds };
  }
};
