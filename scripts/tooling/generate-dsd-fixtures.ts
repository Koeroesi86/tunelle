import { writeFileSync } from 'fs';
import { join } from 'path';
import { chunk, id3, modulate, rate, toDsdiff, u32, u64 } from './dsd-tone';

// ffmpeg cannot encode DSD, so the tone of e2e/fixtures/dsd goes through a second order sigma-delta modulator. See e2e/fixtures/README.md
const blockSize = 4096;

const reverseBits = (data: Buffer) => Buffer.from(data.map((value) => parseInt(value.toString(2).padStart(8, '0').split('').reverse().join(''), 2)));

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

const toDff = (msbFirst: Buffer, tags: Record<string, string>) => toDsdiff({ id: 'DSD ', name: 'not compressed' }, chunk('DSD ', msbFirst), tags);

const album = { TPE1: 'The Sine Waves', TPE2: 'The Sine Waves', TALB: 'Lossless DSD' };
const folder = process.argv[2] ?? join(__dirname, '..', '..', 'e2e', 'fixtures', 'dsd');

writeFileSync(join(folder, '1-concert-a.dsf'), toDsf(modulate(440), { ...album, TIT2: 'Concert A', TRCK: '1' }));
writeFileSync(join(folder, '2-octave-up.dff'), toDff(modulate(880), { ...album, TIT2: 'Octave Up', TRCK: '2' }));
