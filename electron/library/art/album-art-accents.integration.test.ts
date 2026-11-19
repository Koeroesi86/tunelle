import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import executeQuery from '../../database/execute-query';
import { getAlbumArtAccents, queueAlbumArtAccents, storeAlbumArtAccents } from './album-art-accents';
import { backgroundQueue } from '../tasks/background-queue';
import { getAlbumPage, getGroupPage } from '../../repositories/library-repository';
import { createTestDatabase } from '../../test-database';
import type { Task } from '../tasks/task-queue';
import type { Track } from '@shared/types/library';

const picture = (colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: colour } })
    .png()
    .toBuffer();

// the queue is the one of the app: the test asks the task what it would do, and runs it, so no queue runs and nothing waits
vi.mock('../tasks/background-queue', () => ({
  scanKind: 'scan',
  backgroundQueue: { enqueue: vi.fn(), isBusy: vi.fn() },
}));

describe('album art accents', () => {
  let database: Database;
  let root: string;
  const track = (name: string, album: string, cover: string | null): Track => ({
    path: `/music/${album}/${name}.flac`,
    artist: 'Adam',
    album,
    title: name,
    year: '',
    track: '',
    disk: '',
    genre: '',
    picture: cover,
    duration: 60,
  });
  const stored = () =>
    executeQuery<{ picture: string; accent: string }>(database, { query: 'SELECT picture, accent FROM album_art ORDER BY picture', variables: [] });

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-accents-'));
    fs.mkdirSync(path.join(root, 'albumart'));
    global._appDataPath = root;
    database = await createTestDatabase();
    fs.writeFileSync(path.join(root, 'albumart', 'red.png'), await picture({ r: 220, g: 40, b: 40 }));
    fs.writeFileSync(path.join(root, 'albumart', 'grey.png'), await picture({ r: 120, g: 120, b: 120 }));
    fs.writeFileSync(path.join(root, 'albumart', 'broken.png'), 'not a picture');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('puts the picking of the colours on the background queue, which waits for a scan to end', async () => {
    vi.mocked(backgroundQueue.enqueue).mockReset();
    vi.mocked(backgroundQueue.isBusy).mockReset();
    await addTrack(database, track('one', 'Red', 'red.png'));

    queueAlbumArtAccents(database);

    const task: Task = vi.mocked(backgroundQueue.enqueue).mock.calls[0][0];
    expect(task).toMatchObject({ kind: 'album-art', key: 'album-art-accents' });
    vi.mocked(backgroundQueue.isBusy).mockReturnValue(true);
    expect(await task.canRun?.()).toBe(false);
    expect(backgroundQueue.isBusy).toHaveBeenCalledWith('scan');
    expect(await stored()).toEqual([]);

    vi.mocked(backgroundQueue.isBusy).mockReturnValue(false);
    expect(await task.canRun?.()).toBe(true);
    await task.run(new AbortController().signal);
    expect(await stored()).toEqual([{ picture: 'red.png', accent: '#dc2828' }]);
  });

  it('does not fail the queue when the colours cannot be picked', async () => {
    vi.mocked(backgroundQueue.enqueue).mockReset();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await executeQuery(database, { query: 'DROP TABLE album_art', variables: [] });

    await addTrack(database, track('one', 'Red', 'red.png'));
    queueAlbumArtAccents(database);
    const task: Task = vi.mocked(backgroundQueue.enqueue).mock.calls[0][0];

    await expect(task.run(new AbortController().signal)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Picking the colours of the album art failed', expect.anything());
  });

  it('picks the colour of each picture of the library once, and keeps none for a grey or an unreadable picture', async () => {
    await addTrack(database, track('one', 'Red', 'red.png'));
    await addTrack(database, track('two', 'Red', 'red.png'));
    await addTrack(database, track('three', 'Grey', 'grey.png'));
    await addTrack(database, track('four', 'Broken', 'broken.png'));
    await addTrack(database, track('five', 'None', null));

    await storeAlbumArtAccents(database);

    expect(await stored()).toEqual([
      { picture: 'broken.png', accent: '' },
      { picture: 'grey.png', accent: '' },
      { picture: 'red.png', accent: '#dc2828' },
    ]);
  });

  it('does not read a picture again once it has a row', async () => {
    await addTrack(database, track('one', 'Red', 'red.png'));
    await storeAlbumArtAccents(database);
    fs.rmSync(path.join(root, 'albumart', 'red.png'));

    await storeAlbumArtAccents(database);

    expect(await stored()).toEqual([{ picture: 'red.png', accent: '#dc2828' }]);
  });

  it('lists only the pictures that have a colour', async () => {
    await addTrack(database, track('one', 'Red', 'red.png'));
    await addTrack(database, track('two', 'Grey', 'grey.png'));
    await storeAlbumArtAccents(database);

    expect(await getAlbumArtAccents(database, ['red.png', 'grey.png', 'new.png', null])).toEqual(new Map([['red.png', '#dc2828']]));
    expect(await getAlbumArtAccents(database, [null])).toEqual(new Map());
  });

  it('puts the colour on the albums and the groups of the pages', async () => {
    await addTrack(database, track('one', 'Red', 'red.png'));
    await addTrack(database, track('two', 'Grey', 'grey.png'));
    await storeAlbumArtAccents(database);

    const albums = await getAlbumPage(database, 0, 10, { sort: undefined, folders: [] });
    expect(albums.items.map(({ title, accent }) => [title, accent])).toEqual([
      ['Grey', undefined],
      ['Red', '#dc2828'],
    ]);

    const groups = await getGroupPage(database, 'artist', 0, 10, { sort: undefined, folders: [], filter: '' });
    // the cover of an artist is the last picture of its tracks by name
    expect(groups.items.map(({ name, accent }) => [name, accent])).toEqual([['Adam', '#dc2828']]);
  });
});
