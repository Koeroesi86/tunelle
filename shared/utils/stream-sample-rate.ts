const mp3Bitrates = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const mp3Rates = [[11025, 12000, 8000], [], [22050, 24000, 16000], [44100, 48000, 32000]];
const aacRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** Opus decodes at 48 kHz whatever the rate it was recorded at */
const opusRate = 48000;

interface Frame {
  length: number;
  sampleRate: number;
}

const mp3FrameAt = (bytes: Uint8Array, offset: number): Frame | undefined => {
  const [first, second, third] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]];
  // 11 bits of sync and Layer III
  if (first !== 0xff || (second & 0xe0) !== 0xe0 || ((second >> 1) & 3) !== 1) return undefined;
  const version = (second >> 3) & 3;
  const bitrate = (version === 3 ? mp3Bitrates.mpeg1 : mp3Bitrates.mpeg2)[third >> 4];
  const sampleRate = mp3Rates[version]?.[(third >> 2) & 3];
  if (!bitrate || !sampleRate) return undefined;

  return { length: Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / sampleRate) + ((third >> 1) & 1), sampleRate };
};

const adtsFrameAt = (bytes: Uint8Array, offset: number): Frame | undefined => {
  const [first, second, third, fourth, fifth, sixth] = bytes.subarray(offset, offset + 6);
  const sampleRate = aacRates[(third >> 2) & 15];
  const length = ((fourth & 3) << 11) | (fifth << 3) | (sixth >> 5);
  // 12 bits of sync and no layer
  if (first !== 0xff || (second & 0xf6) !== 0xf0 || !sampleRate || length < 7) return undefined;

  return { length, sampleRate };
};

/** A frame counts when the next frame follows it, as the sync of a frame is a pattern that audio data and tags hold by chance */
const confirmedFrameAt = (frameAt: (bytes: Uint8Array, offset: number) => Frame | undefined, bytes: Uint8Array, offset: number) => {
  const frame = frameAt(bytes, offset);
  return frame && frameAt(bytes, offset + frame.length)?.sampleRate === frame.sampleRate ? frame.sampleRate : undefined;
};

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

const indexOfBytes = (bytes: Uint8Array, pattern: number[]) => bytes.findIndex((_, index) => pattern.every((byte, step) => bytes[index + step] === byte));

const oggRate = (bytes: Uint8Array) => {
  if (indexOfBytes(bytes, ascii('OpusHead')) >= 0) return opusRate;

  const vorbis = indexOfBytes(bytes, [1, ...ascii('vorbis')]);
  // after the type, the name, the version of 4 bytes and the channels of 1 byte
  return vorbis < 0 || vorbis + 16 > bytes.length ? undefined : new DataView(bytes.buffer, bytes.byteOffset + vorbis + 12, 4).getUint32(0, true);
};

/**
 * The sample rate in the start of an audio stream: MP3 and AAC (ADTS) by the header of two frames in a row, Opus and Vorbis in an Ogg stream by the header of the codec.
 * Undefined when the bytes hold none, which may be as more of the stream is needed.
 */
export const detectStreamSampleRate = (bytes: Uint8Array) => {
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS') return oggRate(bytes);

  return bytes.reduce<number | undefined>(
    (found, _, offset) => found ?? confirmedFrameAt(mp3FrameAt, bytes, offset) ?? confirmedFrameAt(adtsFrameAt, bytes, offset),
    undefined
  );
};
