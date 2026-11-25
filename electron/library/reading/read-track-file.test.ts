import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { parseFile } from 'music-metadata';
import { memoryFs } from '../../test-memory-fs';
import { readTrackFile } from './read-track-file';
import { readLargeWave } from './read-large-wave';
import { readDstDuration } from './read-dst-duration';

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));
vi.mock('./read-large-wave', () => ({ readLargeWave: vi.fn() }));
vi.mock('./read-dst-duration', () => ({ readDstDuration: vi.fn() }));

const withPicture = (data: string) => ({
  common: { album: 'Album', picture: [{ format: 'image/jpeg', data: Buffer.from(data) }] },
  format: { duration: 60 },
  native: {},
});

describe('readTrackFile pictures', () => {
  const root = '/user-data';
  const folder = () => path.join(root, 'albumart');

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the picture into the album art folder and names it', async () => {
    vi.mocked(parseFile).mockResolvedValue(withPicture('cover') as never);

    const track = await readTrackFile('/music/a.flac', root);

    expect(memoryFs.sync.readdirSync(folder())).toEqual([track.picture]);
    expect(track.picture).toMatch(/^album-[0-9a-f]{32}\.jpg$/);
  });

  it('makes the folder once for the pictures of a process', async () => {
    const mkdir = vi.spyOn(memoryFs.sync, 'mkdirSync');
    vi.mocked(parseFile)
      .mockResolvedValueOnce(withPicture('one') as never)
      .mockResolvedValueOnce(withPicture('two') as never);

    await readTrackFile('/music/a.flac', root);
    await readTrackFile('/music/b.flac', root);

    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(memoryFs.sync.readdirSync(folder())).toHaveLength(2);
  });

  it('makes the folder again when it was removed meanwhile', async () => {
    vi.mocked(parseFile)
      .mockResolvedValueOnce(withPicture('one') as never)
      .mockResolvedValueOnce(withPicture('two') as never);
    await readTrackFile('/music/a.flac', root);
    memoryFs.sync.rmSync(folder(), { recursive: true });

    const track = await readTrackFile('/music/b.flac', root);

    expect(memoryFs.sync.readdirSync(folder())).toEqual([track.picture]);
  });

  it('keeps the picture that is stored already', async () => {
    vi.mocked(parseFile).mockResolvedValue(withPicture('same') as never);

    const first = await readTrackFile('/music/a.flac', root);
    const second = await readTrackFile('/music/b.flac', root);

    expect(second.picture).toBe(first.picture);
    expect(memoryFs.sync.readdirSync(folder())).toHaveLength(1);
  });
});

describe('readTrackFile of Wave64 and RF64', () => {
  const wave = {
    common: { title: 'Concert A', album: 'Album' },
    format: { codec: 'PCM', container: 'WAVE', lossless: true, bitsPerSample: 16, sampleRate: 44100, bitrate: 705600, duration: 6 },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads a .w64 file with readLargeWave, as music-metadata fails on it', async () => {
    vi.mocked(readLargeWave).mockResolvedValue(wave);

    const track = await readTrackFile('/music/a.W64', '/user-data');

    expect(track).toMatchObject({ title: 'Concert A', album: 'Album', codec: 'WAV', duration: 6, bitDepth: 16, trackGain: null });
    expect(parseFile).not.toHaveBeenCalled();
  });

  it('fails for a .w64 file that is not Wave64', async () => {
    vi.mocked(readLargeWave).mockResolvedValue(undefined);

    await expect(readTrackFile('/music/a.w64', '/user-data')).rejects.toThrow('/music/a.w64 is not a Wave64 file');
  });

  it('reads a file that music-metadata finds no codec in with readLargeWave, which is an RF64 file', async () => {
    vi.mocked(parseFile).mockResolvedValue({ common: {}, format: {}, native: {} } as never);
    vi.mocked(readLargeWave).mockResolvedValue(wave);

    expect(await readTrackFile('/music/a.wav', '/user-data')).toMatchObject({ title: 'Concert A', codec: 'WAV', duration: 6 });
  });

  it('keeps what music-metadata read when the file is not RF64', async () => {
    vi.mocked(parseFile).mockResolvedValue({ common: { title: 'Tagged' }, format: {}, native: {} } as never);
    vi.mocked(readLargeWave).mockResolvedValue(undefined);

    expect(await readTrackFile('/music/a.wav', '/user-data')).toMatchObject({ title: 'Tagged', codec: null });
  });

  it('does not look at the header of a file that music-metadata read the codec of', async () => {
    vi.mocked(parseFile).mockClear();
    vi.mocked(readLargeWave).mockClear();
    vi.mocked(parseFile).mockResolvedValue({ common: {}, format: { codec: 'FLAC' }, native: {} } as never);

    await readTrackFile('/music/a.flac', '/user-data');

    expect(readLargeWave).not.toHaveBeenCalled();
  });
});

describe('readTrackFile of DST', () => {
  const format = { codec: 'DST (DST Encoded)', container: 'DSDIFF/DSD', sampleRate: 2822400 };

  it('takes the length from readDstDuration, as music-metadata gives none', async () => {
    vi.mocked(parseFile).mockResolvedValue({ common: {}, format, native: {} } as never);
    vi.mocked(readDstDuration).mockResolvedValue(6);

    expect(await readTrackFile('/music/a.dff', '/user-data')).toMatchObject({ codec: 'DST', bitDepth: 1, lossless: 1, duration: 6 });
  });

  it('stores no length when the file gives none', async () => {
    vi.mocked(parseFile).mockResolvedValue({ common: {}, format, native: {} } as never);
    vi.mocked(readDstDuration).mockResolvedValue(undefined);

    expect(await readTrackFile('/music/a.dff', '/user-data')).toMatchObject({ codec: 'DST', duration: null });
  });
});
