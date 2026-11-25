import { writeFileSync } from 'fs';
import { join } from 'path';
import { chunk, modulate, rate, seconds, toDsdiff, u32 } from './dsd-tone';
import { encodeDstFrame } from './dst-frame';

// ffmpeg cannot encode DST, so the DSD of e2e/fixtures/dsd goes through dst-frame.ts. See e2e/fixtures/README.md
const framesPerSecond = 75;
const frameBytes = rate / framesPerSecond / 8;

const toDstChunk = (dsd: Buffer) => {
  const info = Buffer.alloc(6);
  u32(seconds * framesPerSecond, true).copy(info);
  info.writeUInt16BE(framesPerSecond, 4);
  const frames = Array.from({ length: seconds * framesPerSecond }, (_, index) =>
    chunk('DSTF', encodeDstFrame(dsd.subarray(index * frameBytes, (index + 1) * frameBytes), 1))
  );
  return chunk('DST ', Buffer.concat([chunk('FRTE', info), ...frames]));
};

const album = { TPE1: 'The Sine Waves', TPE2: 'The Sine Waves', TALB: 'Lossless DST' };
const folder = process.argv[2] ?? join(__dirname, '..', '..', 'e2e', 'fixtures', 'dst');
const toDff = (frequency: number, tags: Record<string, string>) => toDsdiff({ id: 'DST ', name: 'DST Encoded' }, toDstChunk(modulate(frequency)), tags);

writeFileSync(join(folder, '1-concert-a.dff'), toDff(440, { ...album, TIT2: 'Concert A', TRCK: '1' }));
writeFileSync(join(folder, '2-octave-up.dff'), toDff(880, { ...album, TIT2: 'Octave Up', TRCK: '2' }));
