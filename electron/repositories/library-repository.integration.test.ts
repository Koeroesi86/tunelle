import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import {
  deleteFolders,
  deleteTracks,
  findPlayableTrack,
  findTrackPath,
  getFolders,
  getAlbumPage,
  getAlbumTracks,
  getGroupPage,
  getFoldersInside,
  getLibrary,
  getTrackPage,
  saveFolders,
} from './library-repository';
import addTrack from '../library/scan/add-track';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';
import type { Track } from '@shared/types/library';
import type { AlbumSort, GroupQuery, GroupSortField, LibraryQuery, TrackSort } from '@shared/types/library-query';

const unsorted = { sort: undefined, folders: [] };

const track = (path: string): Track => ({ path, artist: '', album: '', title: '', year: '', track: '', disk: '', genre: '', picture: null, duration: null });

describe('libraryRepository', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  it('saves folders, replaces one that exists and lists them by path', async () => {
    await saveFolders(database, [
      { path: '/music/b', lastModified: 1 },
      { path: '/music/a', lastModified: 1 },
    ]);
    await saveFolders(database, [{ path: '/music/b', lastModified: 2 }]);

    expect(await getFolders(database)).toEqual([
      { path: '/music/a', lastModified: 1 },
      { path: '/music/b', lastModified: 2 },
    ]);
  });

  it('finds the folders below a folder, with % and _ in the name matching themselves', async () => {
    const music = path.resolve('music');
    await saveFolders(database, [
      { path: path.join(music, '100%'), lastModified: 1 },
      { path: path.join(music, '100%', 'live'), lastModified: 1 },
      { path: path.join(music, '1000', 'live'), lastModified: 1 },
    ]);

    expect((await getFoldersInside(database, path.join(music, '100%'))).map((folder) => folder.path)).toEqual([path.join(music, '100%', 'live')]);
  });

  it('deletes folders and tracks by path', async () => {
    await saveFolders(database, [{ path: '/music/a', lastModified: 1 }]);
    await addTrack(database, track('/music/a/one.flac'));
    await addTrack(database, track('/music/a/two.flac'));

    await deleteFolders(database, [{ path: '/music/a' }]);
    await deleteTracks(database, [{ path: '/music/a/one.flac' }]);

    expect(await getFolders(database)).toEqual([]);
    expect((await getLibrary(database, { sort: undefined, folders: [] })).map((stored) => stored.path)).toEqual(['/music/a/two.flac']);
  });

  it('finds a track path only for a track of the library', async () => {
    await addTrack(database, track('/music/a/one.flac'));

    expect(await findTrackPath(database, '/music/a/one.flac')).toBe('/music/a/one.flac');
    expect(await findTrackPath(database, '/etc/passwd')).toBeUndefined();
  });

  it('finds the path, codec and depth of a track to play, only for a track of the library', async () => {
    await addTrack(database, { ...track('/music/a/one.m4a'), codec: 'ALAC', bitDepth: 24 });

    expect(await findPlayableTrack(database, '/music/a/one.m4a')).toEqual({ path: '/music/a/one.m4a', codec: 'ALAC', bitDepth: 24 });
    expect(await findPlayableTrack(database, '/etc/passwd')).toBeUndefined();
  });

  describe('windows of the library', () => {
    const music = (file: string, album: string, duration = 10): Track => ({
      ...track(file),
      album,
      artist: `artist of ${file}`,
      picture: `${file}.jpg`,
      duration,
    });

    it('pages the tracks in the order of the path, with the total', async () => {
      await Promise.all(['/m/c', '/m/a', '/m/d', '/m/b', '/m/e'].map((file) => addTrack(database, track(file))));

      const page = await getTrackPage(database, 1, 2, unsorted);

      expect(page.items.map((item) => item.path)).toEqual(['/m/b', '/m/c']);
      expect(page.total).toBe(5);
      expect((await getTrackPage(database, 4, 10, unsorted)).items.map((item) => item.path)).toEqual(['/m/e']);
    });

    it('groups the albums by folder and title, first track first, with the values of the first track', async () => {
      await Promise.all(
        [music('/m/x/1.flac', 'Same'), music('/m/x/2.flac', 'Same', 30), music('/m/y/1.flac', 'Same'), music('/m/x/3.flac', 'Other')].map((item) =>
          addTrack(database, item)
        )
      );

      const page = await getAlbumPage(database, 0, 10, unsorted);

      expect(page.total).toBe(3);
      expect(page.items.map(({ id }) => id)).toEqual(['/m/x - Same', '/m/x - Other', '/m/y - Same']);
      expect(page.items[0]).toMatchObject({ path: '/m/x', artist: 'artist of /m/x/1.flac', cover: '/m/x/1.flac.jpg', duration: 40, trackCount: 2 });
      expect((await getAlbumPage(database, 1, 1, unsorted)).items.map(({ id }) => id)).toEqual(['/m/x - Other']);
    });

    it('lists the format of the first track of an album, for its badge', async () => {
      await Promise.all([
        addTrack(database, { ...music('/m/x/1.flac', 'Same'), codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }),
        addTrack(database, { ...music('/m/x/2.flac', 'Same'), codec: 'MP3', lossless: 0, bitrate: 320000 }),
      ]);

      const [album] = (await getAlbumPage(database, 0, 10, unsorted)).items;

      expect(album).toMatchObject({ codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000, trackCount: 2 });
    });

    it('groups the tracks of a folder with either separator, and tracks without an album under an empty title', async () => {
      await Promise.all([music('C:\\m\\1.flac', 'Win'), music('C:\\m\\2.flac', 'Win'), track('/m/none.flac')].map((item) => addTrack(database, item)));

      const page = await getAlbumPage(database, 0, 10, unsorted);

      expect(page.total).toBe(2);
      expect(page.items.map(({ title, trackCount }) => [title, trackCount])).toEqual([
        ['', 1],
        ['Win', 2],
      ]);
      expect((await getAlbumTracks(database, 'C:\\m', 'Win')).map((item) => item.path)).toEqual(['C:\\m\\1.flac', 'C:\\m\\2.flac']);
      expect(await getAlbumTracks(database, '/m', '')).toHaveLength(1);
    });

    it('finds the tracks of an album by its folder and title', async () => {
      await Promise.all(
        [
          music('/m/x/2.flac', 'Same'),
          music('/m/x/1.flac', 'Same'),
          music('/m/y/1.flac', 'Same'),
          music('/m/x/sub/1.flac', 'Same'),
          music('/m/x/3.flac', 'Other'),
        ].map((item) => addTrack(database, item))
      );

      expect((await getAlbumTracks(database, '/m/x', 'Same')).map((item) => item.path)).toEqual(['/m/x/1.flac', '/m/x/2.flac']);
      expect(await getAlbumTracks(database, '/m/x', 'None')).toEqual([]);
    });
  });
  describe('sorting and the folder filter', () => {
    const withValues = (file: string, values: Partial<Track>): Track => ({ ...track(file), ...values });
    const trackSort = (field: TrackSort['field'], direction: TrackSort['direction'] = 'asc'): LibraryQuery<TrackSort> => ({
      sort: { field, direction },
      folders: [],
    });
    const albumSort = (field: AlbumSort['field'], direction: AlbumSort['direction'] = 'asc'): LibraryQuery<AlbumSort> => ({
      sort: { field, direction },
      folders: [],
    });
    const sortedPaths = async (query: LibraryQuery<TrackSort>) => (await getTrackPage(database, 0, 50, query)).items.map((item) => item.path);
    const save = (tracks: Track[]) => Promise.all(tracks.map((item) => addTrack(database, item)));

    it('sorts the text without case and accents, and puts the empty values last in both directions', async () => {
      await save([
        withValues('/m/1', { title: 'zebra' }),
        withValues('/m/2', { title: 'Ékes' }),
        withValues('/m/3', { title: '' }),
        withValues('/m/4', { title: 'apple' }),
        withValues('/m/5', { title: 'Éva' }),
        withValues('/m/6', { title: 'Eper' }),
      ]);

      expect(await sortedPaths(trackSort('title'))).toEqual(['/m/4', '/m/2', '/m/6', '/m/5', '/m/1', '/m/3']);
      expect(await sortedPaths(trackSort('title', 'desc'))).toEqual(['/m/1', '/m/5', '/m/6', '/m/2', '/m/4', '/m/3']);
    });

    it('keeps the default order for the tracks that are equal, also when descending', async () => {
      await save([
        withValues('/m/c', { artist: 'Same' }),
        withValues('/m/a', { artist: 'same' }),
        withValues('/m/b', { artist: 'Other' }),
        withValues('/m/d', { artist: 'Same' }),
      ]);

      expect(await sortedPaths(trackSort('artist'))).toEqual(['/m/b', '/m/a', '/m/c', '/m/d']);
      expect(await sortedPaths(trackSort('artist', 'desc'))).toEqual(['/m/a', '/m/c', '/m/d', '/m/b']);
    });

    it.each<[TrackSort['field'], Partial<Track>[], string[]]>([
      ['album', [{ album: 'b' }, { album: 'A' }, { album: '' }], ['/m/2', '/m/1', '/m/3']],
      ['year', [{ year: '2001-05-03' }, { year: '1999' }, { year: '' }], ['/m/2', '/m/1', '/m/3']],
      ['track', [{ track: '10' }, { track: '9' }, { track: '2/12' }], ['/m/3', '/m/2', '/m/1']],
      ['duration', [{ duration: 200 }, { duration: null }, { duration: 30.5 }], ['/m/3', '/m/1', '/m/2']],
    ])('sorts by %s, the numbers as numbers and the missing value last', async (field, values, expected) => {
      await save(values.map((value, index) => withValues(`/m/${index + 1}`, value)));

      expect(await sortedPaths(trackSort(field))).toEqual(expected);
    });

    it('reverses the numbers and keeps the missing value last', async () => {
      await save([withValues('/m/1', { track: '10' }), withValues('/m/2', { track: '9' }), withValues('/m/3', { track: '' })]);

      expect(await sortedPaths(trackSort('track', 'desc'))).toEqual(['/m/1', '/m/2', '/m/3']);
    });

    it('sorts across the pages, not within a page', async () => {
      await save(['d', 'a', 'c', 'b', 'e'].map((title) => withValues(`/m/${title}-file`, { title: title === 'a' ? 'z' : title })));

      expect((await getTrackPage(database, 0, 2, trackSort('title'))).items.map((item) => item.title)).toEqual(['b', 'c']);
      expect((await getTrackPage(database, 2, 2, trackSort('title'))).items.map((item) => item.title)).toEqual(['d', 'e']);
    });

    it('uses the default order for a field or a direction that is not known, and never puts it into the query', async () => {
      await save([withValues('/m/b', { title: 'a' }), withValues('/m/a', { title: 'b' })]);
      const injected = (field: string, direction: string) => ({ sort: { field, direction } as never, folders: [] });

      expect(await sortedPaths(injected('title; DROP TABLE library', 'asc'))).toEqual(['/m/a', '/m/b']);
      expect(await sortedPaths(injected('title', 'asc; DROP TABLE library'))).toEqual(['/m/a', '/m/b']);
      expect(await sortedPaths(injected('toString', 'asc'))).toEqual(['/m/a', '/m/b']);
      expect(await getLibrary(database, { sort: undefined, folders: [] })).toHaveLength(2);
    });

    it('sorts the whole library the same way as the pages', async () => {
      await save([withValues('/m/1', { title: 'b' }), withValues('/m/2', { title: 'a' })]);

      expect((await getLibrary(database, trackSort('title'))).map((item) => item.path)).toEqual(['/m/2', '/m/1']);
    });

    it('sorts the albums by the title, the first track artist and year, the track count and the duration', async () => {
      await save([
        withValues('/m/a/1.flac', { album: 'Zed', artist: 'Béla', year: '2001', duration: 10 }),
        withValues('/m/a/2.flac', { album: 'Zed', artist: 'Zoltán', year: '1990', duration: 10 }),
        withValues('/m/b/1.flac', { album: 'alpha', artist: 'adam', year: '1980', duration: 500 }),
        withValues('/m/c/1.flac', { album: 'Mid', artist: '', year: '', duration: 30 }),
      ]);
      const titles = async (query: LibraryQuery<AlbumSort>) => (await getAlbumPage(database, 0, 10, query)).items.map((item) => item.title);

      expect(await titles(albumSort('title'))).toEqual(['alpha', 'Mid', 'Zed']);
      expect(await titles(albumSort('title', 'desc'))).toEqual(['Zed', 'Mid', 'alpha']);
      expect(await titles(albumSort('artist'))).toEqual(['alpha', 'Zed', 'Mid']);
      expect(await titles(albumSort('artist', 'desc'))).toEqual(['Zed', 'alpha', 'Mid']);
      expect(await titles(albumSort('year'))).toEqual(['alpha', 'Zed', 'Mid']);
      expect(await titles(albumSort('year', 'desc'))).toEqual(['Zed', 'alpha', 'Mid']);
      expect(await titles(albumSort('trackCount', 'desc'))).toEqual(['Zed', 'alpha', 'Mid']);
      expect(await titles(albumSort('trackCount'))).toEqual(['alpha', 'Mid', 'Zed']);
      expect(await titles(albumSort('duration', 'desc'))).toEqual(['alpha', 'Mid', 'Zed']);
      expect(await titles(albumSort('duration'))).toEqual(['Zed', 'Mid', 'alpha']);
    });

    it('sorts the albums across the pages and keeps the albums that are equal in the default order', async () => {
      await save([withValues('/m/c/1.flac', { album: 'x' }), withValues('/m/a/1.flac', { album: 'x' }), withValues('/m/b/1.flac', { album: 'x' })]);

      expect((await getAlbumPage(database, 1, 1, albumSort('title', 'desc'))).items.map(({ path: folder }) => folder)).toEqual(['/m/b']);
      expect((await getAlbumPage(database, 0, 3, albumSort('title', 'desc'))).items.map(({ path: folder }) => folder)).toEqual(['/m/a', '/m/b', '/m/c']);
    });

    describe('search', () => {
      const searched = (search: string | undefined) => ({ sort: undefined, folders: [], search });

      beforeEach(() =>
        save([
          withValues('/m/a/1.flac', { title: 'Halo', artist: 'Beyoncé', album: 'I Am' }),
          withValues('/m/a/2.flac', { title: 'Sandcastles', artist: 'Beyoncé', album: 'Lemonade' }),
          withValues('/m/b/1.flac', { title: 'Hello', artist: 'Adele', album: '25' }),
          withValues('/m/b/2.flac', { title: '100% _pure', artist: 'Adele', album: '25' }),
        ])
      );

      it('finds the tracks by the artist, the album and the title, without case and accents', async () => {
        const paths = async (search: string) => (await getTrackPage(database, 0, 10, searched(search))).items.map((item) => item.path);

        expect(await paths('BEYONCE')).toEqual(['/m/a/1.flac', '/m/a/2.flac']);
        expect(await paths('lemon')).toEqual(['/m/a/2.flac']);
        expect(await paths('  hel ')).toEqual(['/m/b/1.flac']);
      });

      it('takes % and _ as they are, and no text as no search', async () => {
        const total = async (search: string | undefined) => (await getTrackPage(database, 0, 10, searched(search))).total;

        expect(await total('100% _')).toBe(1);
        expect(await total('%')).toBe(1);
        expect(await total('_')).toBe(1);
        expect(await total('   ')).toBe(4);
        expect(await total(undefined)).toBe(4);
        expect(await total('nothing like it')).toBe(0);
      });

      it('limits the whole library the same way as the pages, and works together with the folders and the sort', async () => {
        expect((await getLibrary(database, { sort: { field: 'title', direction: 'desc' }, folders: [], search: 'adele' })).map((item) => item.path)).toEqual([
          '/m/b/1.flac',
          '/m/b/2.flac',
        ]);
        expect((await getTrackPage(database, 0, 10, { sort: undefined, folders: ['/m/a'], search: 'a' })).total).toBe(2);
        expect((await getTrackPage(database, 0, 10, { sort: undefined, folders: ['/m/b'], search: 'beyonce' })).total).toBe(0);
      });

      it('finds the albums with a matching track, and counts all the tracks of the album', async () => {
        const page = await getAlbumPage(database, 0, 10, searched('pure'));

        expect(page.total).toBe(1);
        expect(page.items.map(({ title, trackCount }) => [title, trackCount])).toEqual([['25', 2]]);
        expect((await getAlbumPage(database, 0, 10, searched('beyonce'))).items.map(({ title }) => title)).toEqual(['I Am', 'Lemonade']);
        expect((await getAlbumPage(database, 0, 10, { sort: undefined, folders: ['/m/a'], search: 'adele' })).total).toBe(0);
        expect((await getAlbumPage(database, 0, 10, searched(undefined))).total).toBe(3);
      });
    });

    describe('folders', () => {
      const music = path.resolve('music');
      const folderA = path.join(music, 'a');
      const folderB = path.join(music, 'b');
      const folderAB = path.join(music, 'ab');

      beforeEach(() =>
        save([
          withValues(path.join(folderA, '1.flac'), { album: 'One' }),
          withValues(path.join(folderA, 'deep', '2.flac'), { album: 'One' }),
          withValues(path.join(folderB, '3.flac'), { album: 'Two' }),
          withValues(path.join(folderAB, '4.flac'), { album: 'Three' }),
        ])
      );

      const pathsIn = async (folders: string[]) =>
        (await getTrackPage(database, 0, 10, { sort: undefined, folders })).items.map((item) => path.relative(music, item.path));

      it('limits the tracks to the tracks below one folder, and not to a folder that only starts with the same text', async () => {
        expect(await pathsIn([folderA])).toEqual([path.join('a', '1.flac'), path.join('a', 'deep', '2.flac')]);
      });

      it('limits the tracks to several folders, with the total of those', async () => {
        const page = await getTrackPage(database, 0, 1, { sort: undefined, folders: [folderB, folderAB] });

        expect(page.total).toBe(2);
        expect(await pathsIn([folderB, folderAB])).toEqual([path.join('ab', '4.flac'), path.join('b', '3.flac')]);
      });

      it('shows everything for no folder, and nothing for a folder without tracks', async () => {
        expect(await pathsIn([])).toHaveLength(4);
        expect(await pathsIn([path.join(music, 'none')])).toEqual([]);
      });

      it('takes a folder with a trailing separator and one with % and _ as they are', async () => {
        expect(await pathsIn([`${folderB}${path.sep}`])).toEqual([path.join('b', '3.flac')]);
        expect(await pathsIn([path.join(music, '%')])).toEqual([]);
        expect(await pathsIn([path.join(music, '_')])).toEqual([]);
      });

      it('limits the albums and their total, and works together with the sort', async () => {
        const page = await getAlbumPage(database, 0, 10, { sort: { field: 'title', direction: 'desc' }, folders: [folderA, folderB] });

        // the album of folder a and the one of its sub folder are two albums
        expect(page.total).toBe(3);
        expect(page.items.map((item) => item.title)).toEqual(['Two', 'One', 'One']);
        expect((await getTrackPage(database, 0, 10, { sort: { field: 'title', direction: 'asc' }, folders: [folderA] })).total).toBe(2);
        expect((await getLibrary(database, { sort: undefined, folders: [folderB] })).map((item) => path.basename(item.path))).toEqual(['3.flac']);
      });

      it('groups the albums of both separators when it filters', async () => {
        await save([withValues('C:\\win\\1.flac', { album: 'Win' }), withValues('C:\\win\\2.flac', { album: 'Win' })]);

        const page = await getAlbumPage(database, 0, 10, { sort: undefined, folders: ['C:\\win'] });

        expect(page.items.map(({ title, trackCount }) => [title, trackCount])).toEqual([['Win', 2]]);
      });
    });
  });

  describe('browsing by artist, album artist and genre', () => {
    const withValues = (file: string, values: Partial<Track>): Track => ({ ...track(file), ...values });
    const save = (tracks: Track[]) => Promise.all(tracks.map((item) => addTrack(database, item)));
    const everything: GroupQuery = { sort: undefined, folders: [], filter: '' };
    const sortedBy = (field: GroupSortField, direction: 'asc' | 'desc' = 'asc'): GroupQuery => ({ ...everything, sort: { field, direction } });
    const names = async (kind: 'artist' | 'albumArtist' | 'genre', query: GroupQuery = everything) =>
      (await getGroupPage(database, kind, 0, 10, query)).items.map((item) => item.name);

    beforeEach(() =>
      save([
        withValues('/m/a/1.flac', { artist: 'Björk', albumArtist: 'Björk', album: 'One', genre: 'Pop', picture: 'one.jpg' }),
        withValues('/m/a/2.flac', { artist: ' bjork ', albumArtist: 'Björk', album: 'One', genre: 'pop' }),
        withValues('/m/b/1.flac', { artist: 'Adam', albumArtist: 'Various', album: 'Mix', genre: 'Rock' }),
        withValues('/m/c/1.flac', { artist: 'Adam', albumArtist: 'Various', album: 'Mix', genre: 'Rock' }),
        withValues('/m/c/2.flac', { artist: 'Adam', album: 'Solo', genre: '' }),
        withValues('/m/d/1.flac', { artist: '', album: '' }),
      ])
    );

    it('groups the tracks that differ in case, accents and the space around the name, and counts the albums and the tracks', async () => {
      const page = await getGroupPage(database, 'artist', 0, 10, everything);

      expect(page.total).toBe(3);
      expect(page.items).toEqual([
        { key: 'adam', name: 'Adam', albumCount: 3, trackCount: 3, cover: null, covers: [] },
        { key: 'bjork', name: 'Björk', albumCount: 1, trackCount: 2, cover: 'one.jpg', covers: [] },
        { key: '', name: '', albumCount: 1, trackCount: 1, cover: null, covers: [] },
      ]);
    });

    it('shows the photo of an artist or album artist instead of the cover of an album, and no cover for a genre', async () => {
      await executeQuery(database, {
        query: `INSERT INTO artist_photos (key, picture, checkedAt) VALUES ('adam', 'artist-adam.jpg', 1), ('pop', 'artist-pop.jpg', 1), ('various', NULL, 1)`,
        variables: [],
      });

      const covers = async (kind: 'artist' | 'albumArtist' | 'genre') =>
        (await getGroupPage(database, kind, 0, 10, everything)).items.map((item) => item.cover);

      expect(await covers('artist')).toEqual(['artist-adam.jpg', 'one.jpg', null]);
      // Various has a lookup without a photo and Björk none, no album of Various has a cover
      expect(await covers('albumArtist')).toEqual(['one.jpg', null, null]);
      expect(await covers('genre')).toEqual([null, null, null]);
    });

    it('gives a genre up to three of its covers, from the folders it is limited to, and the artists none', async () => {
      await save(
        ['a', 'b', 'c', 'd'].flatMap((letter) => [
          withValues(`/m/j${letter}/1.flac`, { artist: 'Miles', genre: 'Jazz', album: letter, picture: `${letter}.jpg` }),
          withValues(`/m/j${letter}/2.flac`, { artist: 'Miles', genre: 'Jazz', album: letter, picture: `${letter}.jpg` }),
        ])
      );
      const covers = async (kind: 'artist' | 'genre', filter: string, folders: string[] = []) =>
        (await getGroupPage(database, kind, 0, 10, { ...everything, filter, folders })).items.map((item) => item.covers);

      expect(await covers('genre', 'jazz')).toEqual([['a.jpg', 'b.jpg', 'c.jpg']]);
      expect(await covers('genre', 'jazz', ['/m/jb', '/m/jc', '/m/jd'])).toEqual([['b.jpg', 'c.jpg', 'd.jpg']]);
      expect(await covers('genre', 'pop')).toEqual([['one.jpg']]);
      expect(await covers('artist', 'miles')).toEqual([[]]);
    });

    it('lists the album artists and the genres, the tracks without one last', async () => {
      expect(await names('albumArtist')).toEqual(['Björk', 'Various', '']);
      expect(await names('genre')).toEqual(['Pop', 'Rock', '']);
    });

    it('sorts by the name, the albums and the tracks, in both directions, the nameless last and equal ones by name', async () => {
      expect(await names('artist', sortedBy('name', 'desc'))).toEqual(['Björk', 'Adam', '']);
      expect(await names('artist', sortedBy('trackCount', 'desc'))).toEqual(['Adam', 'Björk', '']);
      expect(await names('artist', sortedBy('trackCount'))).toEqual(['', 'Björk', 'Adam']);
      expect(await names('artist', sortedBy('albumCount', 'desc'))).toEqual(['Adam', 'Björk', '']);
      // Rock and the tracks without a genre have two albums each
      expect(await names('genre', sortedBy('albumCount'))).toEqual(['Pop', 'Rock', '']);
    });

    it('filters by the text in the name without case and accents, with % and _ matching themselves', async () => {
      expect(await names('artist', { ...everything, filter: 'BJÖ' })).toEqual(['Björk']);
      expect(await names('artist', { ...everything, filter: '%' })).toEqual([]);
      expect(await names('artist', { ...everything, filter: '_' })).toEqual([]);
      expect((await getGroupPage(database, 'artist', 0, 10, { ...everything, filter: 'a' })).total).toBe(1);
    });

    it('counts and pages the groups, limited to the folders', async () => {
      const page = await getGroupPage(database, 'artist', 1, 1, { ...everything, folders: ['/m/c', '/m/d'] });

      expect(page.total).toBe(2);
      expect(page.items.map((item) => [item.name, item.trackCount])).toEqual([['', 1]]);
    });

    it('lists the albums of a group, the albums of the nameless one with its key empty', async () => {
      const titles = async (kind: 'artist' | 'albumArtist' | 'genre', key: string) =>
        (await getAlbumPage(database, 0, 10, { sort: undefined, folders: [], group: { kind, key } })).items.map((item) => [
          item.path,
          item.title,
          item.trackCount,
        ]);

      expect(await titles('artist', 'bjork')).toEqual([['/m/a', 'One', 2]]);
      expect(await titles('albumArtist', 'various')).toEqual([
        ['/m/b', 'Mix', 1],
        ['/m/c', 'Mix', 1],
      ]);
      expect(await titles('genre', '')).toEqual([
        ['/m/c', 'Solo', 1],
        ['/m/d', '', 1],
      ]);
      expect((await getAlbumPage(database, 0, 1, { sort: undefined, folders: ['/m/b'], group: { kind: 'artist', key: 'adam' } })).total).toBe(1);
    });
  });
});
