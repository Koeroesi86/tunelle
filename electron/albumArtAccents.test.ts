import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from './addTrack';
import executeQuery from './executeQuery';
import { getAlbumArtAccents, storeAlbumArtAccents } from './albumArtAccents';
import { getAlbumPage, getGroupPage } from './repositories/libraryRepository';
import { createTestDatabase } from './test-database';
import type { Track } from '../types/library';

const picture = (colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: colour } })
    .png()
    .toBuffer();

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
