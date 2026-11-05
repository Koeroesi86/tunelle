import { crc32, deflateSync } from 'zlib';

// the files of the screenshots are written here and not drawn or recorded: the same input gives the same bytes, so a retake shows what changed in the app and not in the pictures

type Colour = number[];

export interface CoverSpec {
  sky: [Colour, Colour];
  sun: Colour;
  ground: [Colour, Colour];
  shape: 'mountains' | 'waves' | 'grid';
}

interface FlacOptions {
  seconds: number;
  tags: Record<string, string | number>;
  cover: Buffer;
  frequency?: number;
  padding?: number;
}

type ByteOrder = 'writeUInt32BE' | 'writeUInt32LE';

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const mix = (from: Colour, to: Colour, amount: number) => from.map((channel, index) => channel + (to[index] - channel) * amount);

// the colours of a cover: the sky from top to horizon, the sun, and two layers of ground in front of it
const horizon = 0.62;
const sunRadius = 0.17;

// what is at a point of the cover (x and y from 0 to 1), a colour of three channels
const paint = ({ sky, sun, ground, shape }: CoverSpec, x: number, y: number) => {
  const sunDistance = Math.hypot(x - 0.5, y - horizon + 0.14);
  const land = {
    // a ridge of two overlapping waves
    mountains: horizon + 0.04 + 0.1 * Math.abs(Math.sin(x * 5.2 + 0.6)) - 0.05 * Math.sin(x * 11),
    // soft layers, each lower than the one before
    waves: horizon + 0.06 + 0.05 * Math.sin(x * 9 + y * 3),
    // a flat plain that lines run across to the vanishing point
    grid: horizon + 0.02,
  }[shape];
  if (y >= land) {
    const depth = (y - land) / (1 - land);
    // the lines across get closer towards the horizon, the ones along it meet in one point
    const lines = shape === 'grid' && (Math.abs((((x - 0.5) / (depth + 0.1)) * 0.5) % 0.25) < 0.004 / (depth + 0.1) || (depth ** 2 * 9) % 1 < 0.06);
    return lines ? sun : mix(ground[0], ground[1], depth);
  }
  return sunDistance < sunRadius ? sun : mix(sky[0], sky[1], y / land);
};

// a number of 32 bits, as the Vorbis comments (little endian) and the picture block (big endian) spell it
const uint32 = (value: number, order: ByteOrder = 'writeUInt32BE') => {
  const bytes = Buffer.alloc(4);
  if (order === 'writeUInt32BE') bytes.writeUInt32BE(value);
  else bytes.writeUInt32LE(value);
  return bytes;
};

const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  return Buffer.concat([uint32(data.length), body, uint32(crc32(body))]);
};

/** A square PNG of the colours of a spec: { sky: [top, horizon], sun, ground: [near, far], shape: 'mountains' | 'waves' | 'grid' }, each colour [r, g, b] */
const drawCover = (spec: CoverSpec, size = 500) => {
  const rows = Array.from({ length: size }, (_, row) =>
    Buffer.from([0, ...Array.from({ length: size }, (_, column) => paint(spec, column / size, row / size).map(clamp)).flat()])
  );
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const crc8 = (bytes: Buffer) =>
  bytes.reduce((crc, byte) => Array.from({ length: 8 }).reduce<number>((value) => (value & 0x80 ? (value << 1) ^ 0x07 : value << 1) & 0xff, crc ^ byte), 0);
const crc16 = (bytes: Buffer) =>
  bytes.reduce(
    (crc, byte) => Array.from({ length: 8 }).reduce<number>((value) => (value & 0x8000 ? (value << 1) ^ 0x8005 : value << 1) & 0xffff, crc ^ (byte << 8)),
    0
  );

const sampleRate = 44100;
const blockSize = 4096;

// the samples of a sine of the frequency (half of the full scale) from the position of the first one, as 16 bit big endian
const toneSamples = (frequency: number, first: number, samples: number) => {
  const bytes = Buffer.alloc(samples * 2);
  Array.from({ length: samples }).forEach((_, index) =>
    bytes.writeInt16BE(Math.round(16383 * Math.sin((2 * Math.PI * frequency * (first + index)) / sampleRate)), index * 2)
  );
  return bytes;
};

// one block: silence is two constant subframes of 16 bits and the whole block a few bytes, a tone is two verbatim subframes with the samples of the sine in both channels
const silentFrame = (number: number, samples: number, frequency?: number) => {
  const last = samples !== blockSize;
  const header = Buffer.concat([
    Buffer.from([0xff, 0xf8, (last ? 0x70 : 0xc0) | 0x09, 0x18]),
    Buffer.from(String.fromCodePoint(number)),
    last ? Buffer.from([(samples - 1) >> 8, (samples - 1) & 255]) : Buffer.alloc(0),
  ]);
  const channel = frequency ? Buffer.concat([Buffer.from([0x02]), toneSamples(frequency, number * blockSize, samples)]) : Buffer.alloc(3);
  const body = Buffer.concat([header, Buffer.from([crc8(header)]), channel, channel]);
  return Buffer.concat([body, Buffer.from([crc16(body) >> 8, crc16(body) & 255])]);
};

const metadataBlock = (type: number, body: Buffer, last = false) =>
  Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type, body.length >> 16, (body.length >> 8) & 255, body.length & 255]), body]);

const lengthPrefixed = (text: string, order?: ByteOrder) => Buffer.concat([uint32(Buffer.byteLength(text), order), Buffer.from(text)]);

// the blocks of a track depend on their number and the tone only, so tracks of the same length and pitch share them: a library of thousands of tracks makes each once
const framesOf = new Map<string, Buffer[]>();
const framesFor = (total: number, frequency?: number): Buffer[] => {
  const key = `${total}/${frequency}`;
  if (!framesOf.has(key)) {
    framesOf.set(
      key,
      Array.from({ length: Math.ceil(total / blockSize) }, (_, number) => silentFrame(number, Math.min(blockSize, total - number * blockSize), frequency))
    );
  }
  return framesOf.get(key) ?? [];
};

/** A stereo 16 bit 44.1 kHz FLAC that lasts the given seconds, silent or a sine of the frequency (Hz), with the tags (an object of Vorbis comments) and the PNG as its front cover, and a block of padding of the given bytes before the cover (the room an editor leaves for tags) */
const writeFlac = ({ seconds, tags, cover, frequency, padding = 0 }: FlacOptions) => {
  const total = seconds * sampleRate;
  const streamInfo = Buffer.alloc(34);
  streamInfo.writeUInt16BE(blockSize, 0);
  streamInfo.writeUInt16BE(blockSize, 2);
  streamInfo.writeBigUInt64BE((BigInt(sampleRate) << 44n) | (1n << 41n) | (15n << 36n) | BigInt(total), 10);

  const comments = Object.entries(tags).map(([key, value]) => lengthPrefixed(`${key}=${value}`, 'writeUInt32LE'));
  const vorbis = Buffer.concat([lengthPrefixed('Tunelle screenshots', 'writeUInt32LE'), uint32(comments.length, 'writeUInt32LE'), ...comments]);
  const picture = Buffer.concat([
    uint32(3),
    lengthPrefixed('image/png', 'writeUInt32BE'),
    uint32(0),
    uint32(500),
    uint32(500),
    uint32(24),
    uint32(0),
    uint32(cover.length),
    cover,
  ]);

  return Buffer.concat([
    Buffer.from('fLaC'),
    metadataBlock(0, streamInfo),
    metadataBlock(4, vorbis),
    ...(padding > 0 ? [metadataBlock(1, Buffer.alloc(padding))] : []),
    metadataBlock(6, picture, true),
    ...framesFor(total, frequency),
  ]);
};

export { drawCover, writeFlac };
