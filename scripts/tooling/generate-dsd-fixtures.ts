import { writeFileSync } from 'fs';
import { join } from 'path';

// ffmpeg cannot encode DSD, so the tone of e2e/fixtures/dsd goes through a second order sigma-delta modulator. See e2e/fixtures/README.md
const rate = 2822400;
const seconds = 3;
const amplitude = 0.5;
const blockSize = 4096;

const modulate = (frequency: number) => {
  const bits = Buffer.alloc((rate * seconds) / 8);
  const step = (2 * Math.PI * frequency) / rate;
  let [v1, v2, y] = [0, 0, 0];
  for (let n = 0; n < rate * seconds; n += 1) {
    v1 += amplitude * Math.sin(step * n) - y;
    v2 += v1 - y;
    y = v2 >= 0 ? 1 : -1;
    bits[n >> 3] |= (y > 0 ? 0x80 : 0) >> (n & 7);
  }
  return bits;
};

const reverseBits = (data: Buffer) => Buffer.from(data.map((value) => parseInt(value.toString(2).padStart(8, '0').split('').reverse().join(''), 2)));

const id3 = (tags: Record<string, string>) => {
  const frames = Buffer.concat(
    Object.entries(tags).map(([name, text]) => {
      const header = Buffer.alloc(10);
      header.write(name, 0, 'latin1');
      header.writeUInt32BE(text.length + 1, 4);
      return Buffer.concat([header, Buffer.from(`\0${text}`, 'latin1')]);
    })
  );
  const size = Buffer.from([21, 14, 7, 0].map((shift) => (frames.length >> shift) & 0x7f));
  return Buffer.concat([Buffer.from('ID3\x03\0\0', 'latin1'), size, frames]);
};

const u64 = (value: number, bigEndian = false) => {
  const buffer = Buffer.alloc(8);
  if (bigEndian) buffer.writeBigUInt64BE(BigInt(value));
  else buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
};

const u32 = (value: number, bigEndian = false) => {
  const buffer = Buffer.alloc(4);
  if (bigEndian) buffer.writeUInt32BE(value);
  else buffer.writeUInt32LE(value);
  return buffer;
};

const toDsf = (msbFirst: Buffer, tags: Record<string, string>) => {
  const lsbFirst = reverseBits(msbFirst);
  const padded = Buffer.concat([lsbFirst, Buffer.alloc((blockSize - (lsbFirst.length % blockSize)) % blockSize)]);
  const tag = id3(tags);
  const dataSize = 12 + padded.length;
  const metadataAt = 28 + 52 + dataSize;
  const header = Buffer.concat([Buffer.from('DSD '), u64(28), u64(metadataAt + tag.length), u64(metadataAt)]);
  const format = Buffer.concat([
    Buffer.from('fmt '),
    u64(52),
    ...[1, 0, 1, 1, rate, 1].map((value) => u32(value)),
    u64(msbFirst.length * 8),
    u32(blockSize),
    u32(0),
  ]);
  return Buffer.concat([header, format, Buffer.from('data'), u64(dataSize), padded, tag]);
};

const chunk = (name: string, payload: Buffer) => Buffer.concat([Buffer.from(name), u64(payload.length, true), payload, Buffer.alloc(payload.length % 2)]);

const toDff = (msbFirst: Buffer, tags: Record<string, string>) => {
  const property = Buffer.concat([
    Buffer.from('SND '),
    chunk('FS  ', u32(rate, true)),
    chunk('CHNL', Buffer.concat([Buffer.from([0, 1]), Buffer.from('C   ')])),
    chunk('CMPR', Buffer.concat([Buffer.from('DSD '), Buffer.from([14]), Buffer.from('not compressed\0')])),
  ]);
  const body = Buffer.concat([
    Buffer.from('DSD '),
    chunk('FVER', u32(0x01050000, true)),
    chunk('PROP', property),
    chunk('DSD ', msbFirst),
    chunk('ID3 ', id3(tags)),
  ]);
  return Buffer.concat([Buffer.from('FRM8'), u64(body.length, true), body]);
};

const album = { TPE1: 'The Sine Waves', TPE2: 'The Sine Waves', TALB: 'Lossless DSD' };
const folder = process.argv[2] ?? join(__dirname, '..', '..', 'e2e', 'fixtures', 'dsd');

writeFileSync(join(folder, '1-concert-a.dsf'), toDsf(modulate(440), { ...album, TIT2: 'Concert A', TRCK: '1' }));
writeFileSync(join(folder, '2-octave-up.dff'), toDff(modulate(880), { ...album, TIT2: 'Octave Up', TRCK: '2' }));
