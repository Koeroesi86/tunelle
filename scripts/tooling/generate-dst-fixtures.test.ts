import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBuffer } from 'music-metadata';
import { memoryFs } from '../../electron/test-memory-fs';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));

describe('generate-dst-fixtures', () => {
  const argv = process.argv;

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/dst');
    process.argv = ['node', 'generate-dst-fixtures.ts', '/dst'];
  });

  afterEach(() => {
    process.argv = argv;
  });

  it('writes two tagged DSDIFF files of 225 DST coded frames of a mono tone each', async () => {
    vi.resetModules();
    await import('./generate-dst-fixtures');

    expect(memoryFs.sync.readdirSync('/dst')).toEqual(['1-concert-a.dff', '2-octave-up.dff']);
    const [first, second] = ['1-concert-a.dff', '2-octave-up.dff'].map((name) => Buffer.from(memoryFs.sync.readFileSync(`/dst/${name}`)));
    const metadata = await parseBuffer(first, { mimeType: 'audio/x-dff' });
    expect(metadata.common).toMatchObject({ title: 'Concert A', artist: 'The Sine Waves', album: 'Lossless DST', track: { no: 1 } });
    expect(metadata.format).toMatchObject({ codec: 'DST (DST Encoded)', sampleRate: 2822400, numberOfChannels: 1 });
    expect(first.toString('latin1').split('DSTF')).toHaveLength(226);
    // the first bit of a frame says that it is coded
    expect(first[first.indexOf('DSTF') + 12] >> 7).toBe(1);
    expect(first.equals(second)).toBe(false);
  }, 30000);
});
