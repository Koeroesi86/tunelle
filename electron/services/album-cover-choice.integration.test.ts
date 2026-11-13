import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import executeQuery from '../database/execute-query';
import addTrack from '../library/scan/add-track';
import { applyAlbumCovers } from '../library/art/apply-album-covers';
import { readTrackFile } from '../library/reading/read-track-file';
import { createTestDatabase } from '../test-database';
import { chooseAlbumCover, removeAlbumCover, resetAlbumCover } from './album-cover-choice';

vi.mock('../library/reading/read-track-file', () => ({ readTrackFile: vi.fn() }));

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('jpeg')]);

const track = (file: string, album: string, picture: string | null): Track => ({
  path: file,
  artist: 'Artist',
  album,
  title: file,
  year: 2020,
  track: 1,
  disk: 1,
  genre: 'Rock',
  picture,
  duration: 100,
});

describe('the cover of an album the user chooses', () => {
  let database: Database;
  let folder: string;
  const pictures = () =>
    executeQuery<{ path: string; picture: string | null }>(database, { query: 'SELECT path, picture FROM library ORDER BY path', variables: [] }).then((rows) =>
      Object.fromEntries(rows.map((row) => [row.path, row.picture]))
    );
  const covers = () => executeQuery<{ picture: string | null }>(database, { query: 'SELECT picture FROM album_covers', variables: [] });
  const files = () => fs.readdirSync(folder).sort();

  beforeEach(async () => {
    database = await createTestDatabase();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-album-cover-'));
    await addTrack(database, track('/music/one/01.flac', 'Songs', 'tags-one.jpg'));
    await addTrack(database, track('/music/one/02.flac', 'Songs', 'tags-one.jpg'));
    await addTrack(database, track('/music/one/03.flac', 'Other', 'tags-other.jpg'));
    await addTrack(database, track('/music/two/01.flac', 'Songs', 'tags-two.jpg'));
  });

  afterEach(() => {
    database.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('gives the tracks of that album in that folder the image, and no other', async () => {
    const picture = await chooseAlbumCover(database, folder, '/music/one', 'Songs', { extension: 'png', data: png });

    expect(picture).toMatch(/^cover-[0-9a-f]{16}-[0-9a-f]{12}\.png$/);
    expect(fs.readFileSync(path.join(folder, picture))).toEqual(png);
    expect(await pictures()).toEqual({
      '/music/one/01.flac': picture,
      '/music/one/02.flac': picture,
      '/music/one/03.flac': 'tags-other.jpg',
      '/music/two/01.flac': 'tags-two.jpg',
    });
  });

  it('names a replaced cover by what is in it, and deletes the one it replaces with its smaller copy and its colour', async () => {
    const first = await chooseAlbumCover(database, folder, '/music/one/', 'Songs', { extension: 'png', data: png });
    fs.writeFileSync(path.join(folder, `${path.basename(first, '.png')}-optimized.png`), 'small');
    fs.writeFileSync(path.join(folder, 'tags-one.jpg'), 'cover of the tags');
    await executeQuery(database, { query: 'INSERT INTO album_art (picture, accent) VALUES (?, ?)', variables: [first, '#112233'] });

    const second = await chooseAlbumCover(database, folder, '/music/one', 'Songs', { extension: 'jpg', data: jpeg });

    expect(second).not.toBe(first);
    expect(files()).toEqual([second, 'tags-one.jpg']);
    expect(await executeQuery(database, { query: 'SELECT picture FROM album_art', variables: [] })).toEqual([]);
    expect(await covers()).toEqual([{ picture: second }]);
  });

  it('takes the cover away without deleting the files of the tags', async () => {
    fs.writeFileSync(path.join(folder, 'tags-one.jpg'), 'cover of the tags');

    expect(await removeAlbumCover(database, folder, '/music/one', 'Songs')).toBeNull();

    expect(await pictures()).toMatchObject({ '/music/one/01.flac': null, '/music/one/02.flac': null, '/music/one/03.flac': 'tags-other.jpg' });
    expect(await covers()).toEqual([{ picture: null }]);
    expect(files()).toEqual(['tags-one.jpg']);
  });

  it('gives back the cover of the tags that are read from the files, and forgets the choice', async () => {
    const chosen = await chooseAlbumCover(database, folder, '/music/one', 'Songs', { extension: 'png', data: png });
    vi.mocked(readTrackFile).mockImplementation(async (file) => track(file, 'Songs', 'read.jpg'));

    expect(await resetAlbumCover(database, folder, '/music/one', 'Songs')).toBe('read.jpg');

    expect(await pictures()).toMatchObject({ '/music/one/01.flac': 'read.jpg', '/music/one/02.flac': 'read.jpg', '/music/two/01.flac': 'tags-two.jpg' });
    expect(await covers()).toEqual([]);
    expect(files()).not.toContain(chosen);
  });

  it('keeps the choice of a file that cannot be read, and tells no cover when none is read', async () => {
    vi.mocked(readTrackFile).mockRejectedValue(new Error('unreadable'));
    await chooseAlbumCover(database, folder, '/music/one', 'Songs', { extension: 'png', data: png });

    expect(await resetAlbumCover(database, folder, '/music/one', 'Songs')).toBeNull();
    expect(await covers()).toEqual([]);
  });

  it('gives a track that a scan added the cover that was chosen for its album, and takes it from nobody else', async () => {
    const chosen = await chooseAlbumCover(database, folder, '/music/one', 'Songs', { extension: 'png', data: png });
    await addTrack(database, track('/music/one/04.flac', 'Songs', 'tags-new.jpg'));
    await addTrack(database, track('/music/one/01.flac', 'Songs', 'tags-reread.jpg'));

    await applyAlbumCovers(database);

    expect(await pictures()).toEqual({
      '/music/one/01.flac': chosen,
      '/music/one/02.flac': chosen,
      '/music/one/03.flac': 'tags-other.jpg',
      '/music/one/04.flac': chosen,
      '/music/two/01.flac': 'tags-two.jpg',
    });
  });
});
