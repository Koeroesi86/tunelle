import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import executeQuery from '../database/execute-query';
import executeQueries from '../database/execute-queries';
import { getAlbumArtAccents } from '../library/art/album-art-accents';
import { fakeDatabase } from '../test-fake-database';
import {
  deleteFolders,
  deleteTracks,
  deleteTracksInside,
  findPlayableTrack,
  findTrackFormat,
  findTrackPath,
  getAlbumPage,
  getAlbumTrackList,
  getAlbumTracks,
  getFolders,
  getFoldersInside,
  getGroupCover,
  getGroupPage,
  getLibrary,
  getLibraryPaths,
  getTrackList,
  getTrackListByPaths,
  getTrackPage,
  getTracksInside,
  hasTracksInside,
  saveFolders,
} from './library-repository';

vi.mock('../database/execute-query', () => ({ default: vi.fn() }));
vi.mock('../database/execute-queries', () => ({ default: vi.fn() }));
vi.mock('../library/art/album-art-accents', () => ({ getAlbumArtAccents: vi.fn() }));

const database = fakeDatabase();
const calls = () => vi.mocked(executeQuery).mock.calls.map(([, query]) => query);
const last = () => calls().at(-1);

describe('the library repository', () => {
  beforeEach(() => {
    vi.mocked(executeQuery).mockReset().mockResolvedValue([]);
    vi.mocked(executeQueries).mockReset().mockResolvedValue([]);
    vi.mocked(getAlbumArtAccents)
      .mockReset()
      .mockResolvedValue(new Map([['one.png', '#112233']]));
  });

  describe('folders', () => {
    it('reads the folders by path, and the ones below a folder with the characters of LIKE escaped', async () => {
      await getFolders(database);
      await getFoldersInside(database, '/music/100%_pure/');

      expect(calls()[0].query).toContain('ORDER BY path ASC');
      expect(calls()[1].variables).toEqual([`/music/100!%!_pure${path.sep}%`]);
    });

    it('saves and deletes a folder with a query for each', async () => {
      await saveFolders(database, [
        { path: '/a', lastModified: 1 },
        { path: '/b', lastModified: 2 },
      ]);
      await deleteFolders(database, [{ path: '/a' }]);

      expect(vi.mocked(executeQueries).mock.calls.map(([, queries]) => queries.map(({ variables }) => variables))).toEqual([
        [
          ['/a', 1],
          ['/b', 2],
        ],
        [['/a']],
      ]);
    });
  });

  describe('tracks of a folder', () => {
    it('matches the paths below a folder with both separators, once when they are the same', async () => {
      await getTracksInside(database, 'C:\\Music\\');
      await hasTracksInside(database, '/music');

      expect(calls()[0].variables).toEqual(['C:/Music/%', `C:\\Music${path.sep}%`].filter((value, index, all) => all.indexOf(value) === index));
      expect(calls()[1].variables).toEqual(['/music/%', `/music${path.sep}%`].filter((value, index, all) => all.indexOf(value) === index));
    });

    it('tells whether there is a track below a folder', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([{ found: 1 }]);

      expect(await hasTracksInside(database, '/music')).toBe(true);
      expect(await hasTracksInside(database, '/music')).toBe(false);
    });

    it('removes the loudness and the tracks below a folder from the library', async () => {
      await deleteTracksInside(database, '/music');

      expect(vi.mocked(executeQueries).mock.calls[0][1].map(({ query }) => query.split(' WHERE')[0])).toEqual([
        'DELETE FROM track_loudness',
        'DELETE FROM library',
      ]);
    });

    it('removes tracks with their loudness', async () => {
      await deleteTracks(database, [{ path: '/a.flac' }]);

      expect(vi.mocked(executeQueries).mock.calls[0][1].map(({ variables }) => variables)).toEqual([['/a.flac'], ['/a.flac']]);
    });
  });

  describe('single tracks', () => {
    it('gives the first row, or nothing for a track the library does not have', async () => {
      vi.mocked(executeQuery)
        .mockResolvedValueOnce([{ path: '/a.flac' }])
        .mockResolvedValueOnce([]);
      expect(await findTrackPath(database, '/a.flac')).toBe('/a.flac');
      expect(await findTrackPath(database, '/b.flac')).toBeUndefined();

      vi.mocked(executeQuery).mockResolvedValueOnce([{ path: '/a.flac', codec: 'flac', bitDepth: 16 }]);
      expect(await findPlayableTrack(database, '/a.flac')).toEqual({ path: '/a.flac', codec: 'flac', bitDepth: 16 });
      expect(await findTrackFormat(database, '/missing')).toBeUndefined();
    });

    it('takes the loudness from the tags first and the measurement while it is of the file as it is', async () => {
      await findTrackFormat(database, '/a.flac');

      expect(last()?.query).toContain('COALESCE(library.trackGain, (SELECT track_loudness.trackGain');
      expect(last()?.query).toContain('track_loudness.fileModified = library.fileModified');
    });

    it('lists the paths of the library', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([{ path: '/a' }, { path: '/b' }]);

      expect(await getLibraryPaths(database)).toEqual(['/a', '/b']);
    });

    it('reads the tracks of paths in chunks of 500', async () => {
      const paths = Array.from({ length: 1001 }, (_, index) => `/m/${index}.flac`);
      vi.mocked(executeQuery).mockResolvedValue([{ path: 'x' }]);

      await getTrackListByPaths(database, paths);

      expect(calls().map(({ variables }) => variables.length)).toEqual([500, 500, 1]);
    });

    it('reads the tracks of an album by its folder with and without the trailing separator', async () => {
      await getAlbumTracks(database, '/m/a', 'One');
      await getAlbumTrackList(database, '/m/a', 'One');

      expect(calls().map(({ variables }) => variables)).toEqual([
        ['/m/a', '/m/a/', '/m/a\\', 'One'],
        ['/m/a', '/m/a/', '/m/a\\', 'One'],
      ]);
    });
  });

  describe('lists', () => {
    const query = { folders: ['/m/a/'], search: 'Beá', sort: undefined };

    it('filters by the folders and the search, in the order of the path without a sort', async () => {
      await getLibrary(database, query);

      expect(last()?.query).toContain('ORDER BY path ASC');
      expect(last()?.variables).toEqual(['/m/a/%', '/m/a\\%', '%bea%', '%bea%', '%bea%']);
      expect(last()?.query).toContain('title_key LIKE ?');
    });

    it('sorts by a known field with the empty values last, and ignores an unknown field', async () => {
      await getTrackList(database, { folders: [], search: undefined, sort: { field: 'year', direction: 'desc' } });
      await getTrackList(database, { folders: [], search: undefined, sort: { field: 'title', direction: 'asc' } });
      await getTrackList(database, { folders: [], search: undefined, sort: { field: 'nope' as 'title', direction: 'asc' } });
      await getTrackList(database, { folders: [], search: undefined, sort: { field: 'title', direction: 'up' as 'asc' } });

      const orders = calls().map(({ query: sql }) => sql.split('ORDER BY ')[1]);
      expect(orders[0]).toBe('NULLIF(CAST(year AS REAL), 0) IS NULL ASC, NULLIF(CAST(year AS REAL), 0) DESC, path ASC');
      expect(orders[1]).toBe("COALESCE(title_key, '') = '' ASC, title_key ASC, path ASC");
      expect(orders.slice(2)).toEqual(['path ASC', 'path ASC']);
    });

    it('reads a page with the total', async () => {
      vi.mocked(executeQuery)
        .mockResolvedValueOnce([{ path: '/a' }])
        .mockResolvedValueOnce([{ total: 42 }]);

      expect(await getTrackPage(database, 10, 5, query)).toEqual({ items: [{ path: '/a' }], total: 42 });
      expect(calls()[0].variables.slice(-2)).toEqual([5, 10]);
    });
  });

  describe('groups', () => {
    const rows = [{ key: 'adam', name: 'Adam', albumCount: 1, trackCount: 2, cover: 'one.png', covers: null }];

    it('gives the groups with their accent and covers, and the total', async () => {
      vi.mocked(executeQuery)
        .mockResolvedValueOnce([
          ...rows,
          { key: 'rock', name: 'Rock', albumCount: 1, trackCount: 1, cover: null, covers: `a.png${String.fromCharCode(31)}b.png` },
        ])
        .mockResolvedValueOnce([{ total: 2 }]);

      const page = await getGroupPage(database, 'genre', 0, 20, { sort: { field: 'trackCount', direction: 'desc' }, folders: ['/m'], filter: 'Ro_' });

      expect(page.total).toBe(2);
      expect(page.items.map(({ key, accent, covers }) => [key, accent, covers])).toEqual([
        ['adam', '#112233', []],
        ['rock', undefined, ['a.png', 'b.png']],
      ]);
      expect(calls()[0].variables).toEqual(['/m/%', '/m\\%', '%ro!_%', 20, 0]);
      expect(calls()[0].query).toContain('COUNT(*) ASC'.replace(' ASC', ' DESC'));
    });

    it('takes the photo of an artist first, and none for a genre', async () => {
      vi.mocked(executeQuery).mockResolvedValue([{ total: 0 }]);
      await getGroupPage(database, 'artist', 0, 5, { sort: undefined, folders: [], filter: '' });
      await getGroupPage(database, 'albumArtist', 0, 5, { sort: undefined, folders: [], filter: '' });

      expect(calls()[0].query).toContain('SELECT picture FROM artist_photos');
      expect(calls()[2].query).toContain('GROUP BY album_artist_key');
    });

    it('gives the cover of one group, null without a row', async () => {
      vi.mocked(executeQuery).mockResolvedValueOnce([{ cover: 'p.png' }]);

      expect(await getGroupCover(database, 'artist', 'adam')).toEqual({ cover: 'p.png' });
      expect(await getGroupCover(database, 'genre', 'rock')).toEqual({ cover: null });
    });
  });

  describe('albums', () => {
    it('gives the albums with an id, the folder of the first track, the accent, and the total', async () => {
      vi.mocked(executeQuery)
        .mockResolvedValueOnce([{ title: 'One', artist: 'Adam', cover: 'one.png', firstPath: '/m/a/1.flac', trackCount: 2, duration: 5, year: '2001' }])
        .mockResolvedValueOnce([{ total: 7 }]);

      const page = await getAlbumPage(database, 0, 10, {
        sort: { field: 'trackCount', direction: 'desc' },
        folders: ['/m'],
        search: 'one',
        group: { kind: 'artist', key: 'adam' },
      });

      expect(page.total).toBe(7);
      expect(page.items[0]).toMatchObject({ id: `${path.dirname('/m/a/1.flac')} - One`, path: path.dirname('/m/a/1.flac'), accent: '#112233' });
      expect(calls()[0].variables).toEqual(['/m/%', '/m\\%', 'adam', '%one%', '%one%', '%one%', 10, 0]);
      expect(calls()[0].query).toContain('HAVING MAX(');
      expect(calls()[0].query).toContain('ORDER BY (1 = 0) ASC, COUNT(*) DESC, MIN(path) ASC');
    });

    it('has no condition without folders, a group or a search', async () => {
      vi.mocked(executeQuery)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);
      await getAlbumPage(database, 0, 10, { sort: undefined, folders: [], search: undefined, group: undefined });

      expect(calls()[0].query).not.toContain('HAVING');
      expect(calls()[0].variables).toEqual([10, 0]);
    });
  });
});
