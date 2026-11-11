import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from 'music-metadata';
import { afterAll, describe, expect, it } from 'vitest';
import { drawCover, writeFlac } from './screenshot-media';
import type { CoverSpec } from './screenshot-media';

const spec: CoverSpec = {
  sky: [
    [10, 20, 60],
    [40, 90, 140],
  ],
  sun: [120, 230, 200],
  ground: [
    [48, 60, 150],
    [14, 20, 70],
  ],
  shape: 'waves',
};

describe('writeFlac', () => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-flac-test-'));

  type Options = Parameters<typeof writeFlac>[0];

  const read = async (options: Options) => {
    const file = join(folder, `${Math.random()}.flac`);
    writeFileSync(file, writeFlac(options));
    return parseFile(file);
  };

  it('is a 16 bit 44.1 kHz stereo file of the length asked for, with the tags and the cover', async () => {
    const cover = drawCover(spec, 64);
    const { format, common } = await read({
      seconds: 167,
      tags: { TITLE: 'Aurora Drift', ARTIST: 'Northern Lights Orchestra', ALBUM: 'Winter Signals', TRACKNUMBER: 1, DATE: 2021 },
      cover,
    });

    expect([format.container, format.sampleRate, format.numberOfChannels, format.bitsPerSample, Math.round(format.duration ?? 0)]).toEqual([
      'FLAC',
      44100,
      2,
      16,
      167,
    ]);
    expect([common.title, common.artist, common.album, common.track.no, common.year]).toEqual([
      'Aurora Drift',
      'Northern Lights Orchestra',
      'Winter Signals',
      1,
      2021,
    ]);
    expect(Buffer.from(common.picture?.[0].data ?? []).equals(cover)).toBe(true);
  });

  it('counts the samples of a length that is not a whole number of blocks', async () => {
    const { format } = await read({ seconds: 1, tags: {}, cover: drawCover(spec, 8) });

    expect(format.duration).toBe(1);
  });

  it('writes the same bytes every time', () => {
    const options = { seconds: 3, tags: { TITLE: 'a' }, cover: drawCover(spec, 8) };

    expect(writeFlac(options).equals(writeFlac(options))).toBe(true);
  });

  it('stays small, as it holds silence', () => {
    expect(writeFlac({ seconds: 218, tags: {}, cover: drawCover(spec, 8) }).length).toBeLessThan(100000);
  });

  it('holds the samples of a sine when it has a frequency, and still reads as a file of the length asked for', async () => {
    const options = { seconds: 1, tags: {}, cover: drawCover(spec, 8), frequency: 441 };
    const { format } = await read(options);

    expect(format.duration).toBe(1);
    // two channels of 16 bit samples for a second, plus the headers
    expect(writeFlac(options).length).toBeGreaterThan(44100 * 4);
    expect(writeFlac(options).equals(writeFlac({ ...options, frequency: 882 }))).toBe(false);
    // writes the file three times and reads it once, which takes longer than the default on a slow runner
  }, 30000);

  afterAll(() => rmSync(folder, { recursive: true, force: true }));
});
