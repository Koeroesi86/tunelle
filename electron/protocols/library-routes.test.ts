import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisVersion } from '@shared/constants/loudness';
import { libraryRoutes } from './library-routes';
import { fakeDatabase } from '../test-fake-database';
import { findLoudnessAnalysis } from '../repositories/loudness-repository';
import { findTrackFormat, getAlbumPage, getAlbumTrackList, getGroupCover, getGroupPage, getTrackList, getTrackPage } from '../repositories/library-repository';

vi.mock('../repositories/loudness-repository', () => ({ findLoudnessAnalysis: vi.fn() }));
vi.mock('../repositories/library-repository', () => ({
  findTrackFormat: vi.fn(),
  getAlbumPage: vi.fn(),
  getAlbumTrackList: vi.fn(),
  getGroupCover: vi.fn(),
  getGroupPage: vi.fn(),
  getTrackList: vi.fn(),
  getTrackPage: vi.fn(),
}));

describe('library routes for browsing', () => {
  const database = fakeDatabase();
  const answer = (route: string, query = '') => libraryRoutes[route](database, new URLSearchParams(query));

  beforeEach(() => {
    [findLoudnessAnalysis, findTrackFormat, getAlbumPage, getAlbumTrackList, getGroupCover, getGroupPage, getTrackList, getTrackPage].forEach((fn) =>
      vi
        .mocked(fn)
        .mockReset()
        .mockResolvedValue([] as never)
    );
  });

  it('is not served before the database is connected', async () => {
    expect((await libraryRoutes['/library'](undefined, new URLSearchParams())).status).toBe(403);
  });

  it('answers with the result of the query as JSON, 404 for no result, and 500 for an error', async () => {
    vi.mocked(getTrackList).mockResolvedValueOnce([{ path: '/a' }] as never);
    expect(await (await answer('/library')).json()).toEqual([{ path: '/a' }]);

    vi.mocked(findTrackFormat).mockResolvedValueOnce(undefined);
    expect((await answer('/library/track', 'path=/x')).status).toBe(404);

    vi.mocked(getTrackList).mockRejectedValueOnce(new Error('broken'));
    expect((await answer('/library')).status).toBe(500);
  });

  it('lists the tracks in a sort with folders and a search, and refuses a sort that is not known', async () => {
    await answer('/library', 'sort=title&dir=desc&folder=/m&search=Bea');

    expect(getTrackList).toHaveBeenCalledWith(database, { sort: { field: 'title', direction: 'desc' }, folders: ['/m'], search: 'Bea' });
    expect((await answer('/library', 'sort=nope')).status).toBe(400);
  });

  it('reads the format and the analysis of one track by its path, and refuses a request without one', async () => {
    await answer('/library/track', 'path=/m/a.flac');
    await answer('/library/loudness', 'path=/m/a.flac');

    expect(findTrackFormat).toHaveBeenCalledWith(database, '/m/a.flac');
    expect(findLoudnessAnalysis).toHaveBeenCalledWith(database, '/m/a.flac', analysisVersion);
    expect((await answer('/library/track')).status).toBe(400);
    expect((await answer('/library/loudness')).status).toBe(400);
  });

  it('pages the tracks with an offset and a limit that is kept between 1 and 500, and takes the default for text that is no number', async () => {
    await answer('/library/tracks', 'offset=20&limit=9999');
    await answer('/library/tracks', 'offset=x&limit=0');
    await answer('/library/tracks');

    expect(vi.mocked(getTrackPage).mock.calls.map(([, offset, limit]) => [offset, limit])).toEqual([
      [20, 500],
      [0, 1],
      [0, 100],
    ]);
  });

  it('pages the albums of a group, and refuses a group that is half given or of an unknown kind', async () => {
    await answer('/library/albums', 'by=artist&group=adam&sort=title&dir=asc');
    await answer('/library/albums');

    expect(vi.mocked(getAlbumPage).mock.calls[0][3]).toMatchObject({ group: { kind: 'artist', key: 'adam' }, sort: { field: 'title', direction: 'asc' } });
    expect(vi.mocked(getAlbumPage).mock.calls[1][3]).toMatchObject({ group: undefined });
    expect((await answer('/library/albums', 'by=artist')).status).toBe(400);
    expect((await answer('/library/albums', 'by=title&group=x')).status).toBe(400);
    expect((await answer('/library/albums', 'sort=nope')).status).toBe(400);
  });

  it('pages the groups of a kind with a filter, and refuses a kind or a sort that is not known', async () => {
    await answer('/library/groups', 'by=genre&q=ro&sort=trackCount&dir=desc');

    expect(getGroupPage).toHaveBeenCalledWith(database, 'genre', 0, 100, {
      sort: { field: 'trackCount', direction: 'desc' },
      folders: [],
      search: undefined,
      filter: 'ro',
    });
    expect((await answer('/library/groups', 'by=title')).status).toBe(400);
    expect((await answer('/library/groups')).status).toBe(400);
    expect((await answer('/library/groups', 'by=genre&sort=name&dir=up')).status).toBe(400);
  });

  it('answers with the cover of one group, and refuses a request without a kind or a key', async () => {
    await answer('/library/group-cover', 'by=artist&key=adam');

    expect(getGroupCover).toHaveBeenCalledWith(database, 'artist', 'adam');
    expect((await answer('/library/group-cover', 'by=artist')).status).toBe(400);
    expect((await answer('/library/group-cover', 'key=adam')).status).toBe(400);
  });

  it('lists the tracks of an album by its folder and title', async () => {
    await answer('/library/album', 'path=/m/a&title=One');

    expect(getAlbumTrackList).toHaveBeenCalledWith(database, '/m/a', 'One');
    expect((await answer('/library/album', 'path=/m/a')).status).toBe(400);
  });
});
