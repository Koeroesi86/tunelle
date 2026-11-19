import { beforeEach, describe, expect, it, vi } from 'vitest';
import executeQuery from '../database/execute-query';
import { readTrackFile } from '../library/reading/read-track-file';
import { getAlbumTracks } from '../repositories/library-repository';
import { memoryFs } from '../test-memory-fs';
import { fakeDatabase } from '../test-fake-database';
import { chooseAlbumCover, removeAlbumCover, resetAlbumCover } from './album-cover-choice';

vi.mock('fs', () => ({ ...memoryFs.sync, default: { ...memoryFs.sync, promises: memoryFs.promises } }));
vi.mock('../database/execute-query', () => ({ default: vi.fn() }));
vi.mock('../library/reading/read-track-file', () => ({ readTrackFile: vi.fn() }));
vi.mock('../repositories/library-repository', () => ({ getAlbumTracks: vi.fn() }));

const database = fakeDatabase();
const art = '/art';
const queries = () => vi.mocked(executeQuery).mock.calls.map(([, { query, variables }]) => ({ query, variables }));

describe('the cover of an album that the user chose', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(art);
    global._appDataPath = '/data';
    vi.mocked(executeQuery).mockReset().mockResolvedValue([]);
    vi.mocked(getAlbumTracks).mockReset().mockResolvedValue([]);
    vi.mocked(readTrackFile).mockReset();
  });

  it('keeps a picked image under a name of its content, and sets it on the tracks of the album', async () => {
    const name = await chooseAlbumCover(database, art, '/m/a', 'One', { extension: 'png', data: Buffer.from('img') });

    expect(name).toMatch(/^cover-[0-9a-f]{16}-[0-9a-f]{12}\.png$/);
    expect(memoryFs.sync.readdirSync(art)).toEqual([name]);
    expect(queries().map(({ query }) => query.split(' ')[0])).toEqual(['SELECT', 'INSERT', 'UPDATE']);
    expect(queries()[1].variables[1]).toBe(name);
  });

  it('removes the cover and the smaller copy that it replaces, and the colour that was made of it', async () => {
    memoryFs.sync.writeFileSync(`${art}/cover-old.png`, 'x');
    memoryFs.sync.writeFileSync(`${art}/cover-old-optimized.png`, 'x');
    vi.mocked(executeQuery).mockResolvedValueOnce([{ picture: 'cover-old.png' }]);

    await chooseAlbumCover(database, art, '/m/a', 'One', { extension: 'jpg', data: Buffer.from('new') });

    expect(memoryFs.sync.readdirSync(art)).toHaveLength(1);
    expect(queries().at(-1)).toEqual({ query: 'DELETE FROM album_art WHERE picture = ?', variables: ['cover-old.png'] });
  });

  it('never deletes the cover of the tags', async () => {
    memoryFs.sync.writeFileSync(`${art}/album-1.jpg`, 'x');
    vi.mocked(executeQuery).mockResolvedValueOnce([{ picture: 'album-1.jpg' }]);

    expect(await removeAlbumCover(database, art, '/m/a', 'One')).toBeNull();

    expect(memoryFs.sync.existsSync(`${art}/album-1.jpg`)).toBe(true);
    expect(queries()[1].variables[1]).toBeNull();
  });

  it('goes back to the covers of the tags: the first track that has one gives the cover, a track that cannot be read is left alone', async () => {
    vi.mocked(getAlbumTracks).mockResolvedValue([{ path: '/m/a/1.flac' }, { path: '/m/a/2.flac' }, { path: '/m/a/3.flac' }]);
    vi.mocked(readTrackFile)
      .mockResolvedValueOnce({ picture: null } as never)
      .mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({ picture: 'album-3.jpg' } as never);

    expect(await resetAlbumCover(database, art, '/m/a', 'One')).toBe('album-3.jpg');

    expect(vi.mocked(readTrackFile)).toHaveBeenCalledWith('/m/a/1.flac', '/data');
    expect(
      queries()
        .filter(({ query }) => query.startsWith('UPDATE library'))
        .map(({ variables }) => variables)
    ).toEqual([
      [null, '/m/a/1.flac'],
      ['album-3.jpg', '/m/a/3.flac'],
    ]);
    expect(queries().some(({ query }) => query.startsWith('DELETE FROM album_covers'))).toBe(true);
  });

  it('has no cover to return when no track has one', async () => {
    expect(await resetAlbumCover(database, art, '/m/a', 'One')).toBeNull();
  });
});
