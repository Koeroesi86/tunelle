import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBuffer } from 'music-metadata';
import { memoryFs } from '../../electron/test-memory-fs';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));

describe('generate-dsd-fixtures', () => {
  const argv = process.argv;

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/dsd');
    process.argv = ['node', 'generate-dsd-fixtures.ts', '/dsd'];
  });

  afterEach(() => {
    process.argv = argv;
  });

  it('writes a DSF and a DFF file of a tone each, tagged, of 2.8 MHz and three seconds', async () => {
    vi.resetModules();
    await import('./generate-dsd-fixtures');

    expect(memoryFs.sync.readdirSync('/dsd')).toEqual(['1-concert-a.dsf', '2-octave-up.dff']);
    const [dsf, dff] = await Promise.all(
      ['1-concert-a.dsf', '2-octave-up.dff'].map((name, index) =>
        parseBuffer(Buffer.from(memoryFs.sync.readFileSync(`/dsd/${name}`)), { mimeType: index === 0 ? 'audio/x-dsf' : 'audio/x-dff' })
      )
    );
    expect(dsf.common).toMatchObject({ title: 'Concert A', artist: 'The Sine Waves', album: 'Lossless DSD', track: { no: 1 } });
    expect(dff.common).toMatchObject({ title: 'Octave Up', album: 'Lossless DSD' });
    expect(dsf.format).toMatchObject({ sampleRate: 2822400, numberOfChannels: 1 });
    expect(dsf.format.duration).toBeCloseTo(3, 1);
    expect(dff.format.sampleRate).toBe(2822400);
  }, 30000);

  it('starts each file with the header of its format, and the two tones differ', async () => {
    vi.resetModules();
    await import('./generate-dsd-fixtures');
    const [dsf, dff] = ['1-concert-a.dsf', '2-octave-up.dff'].map((name) => memoryFs.sync.readFileSync(`/dsd/${name}`) as Buffer);

    expect(dsf.subarray(0, 4).toString()).toBe('DSD ');
    expect(dff.subarray(0, 4).toString()).toBe('FRM8');
    expect(dsf.equals(dff)).toBe(false);
  }, 30000);
});
