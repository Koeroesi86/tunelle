import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../library/scan/addTrack';
import { libraryRoutes } from './libraryRoutes';
import { createTestDatabase } from '../test-database';
import type { Track } from '@shared/types/library';

const track = (file: string, values: Partial<Track>): Track => ({
  path: file,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
  ...values,
});

describe('library routes for browsing', () => {
  let database: Database;
  const answer = (route: string, query: string) => libraryRoutes[route](database, new URLSearchParams(query));

  beforeEach(async () => {
    database = await createTestDatabase();
    await addTrack(database, track('/m/a/1.flac', { artist: 'Adam', album: 'One', genre: 'Rock' }));
    await addTrack(database, track('/m/b/1.flac', { artist: 'Bea', album: 'Two', genre: 'Pop' }));
  });

  it('lists the groups of a kind with a sort and a filter', async () => {
    const response = await answer('/library/groups', 'by=artist&sort=trackCount&dir=desc&q=be');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, items: [{ key: 'bea', name: 'Bea', albumCount: 1, trackCount: 1 }] });
  });

  it('refuses a kind or a sort that is not known', async () => {
    expect((await answer('/library/groups', 'by=title')).status).toBe(400);
    expect((await answer('/library/groups', '')).status).toBe(400);
    expect((await answer('/library/groups', 'by=genre&sort=name&dir=up')).status).toBe(400);
  });

  it('limits the albums to a group, and refuses a group that is half given or of an unknown kind', async () => {
    const response = await answer('/library/albums', 'by=genre&group=rock');

    expect(await response.json()).toMatchObject({ total: 1, items: [{ title: 'One' }] });
    expect((await answer('/library/albums', 'by=genre')).status).toBe(400);
    expect((await answer('/library/albums', 'group=rock')).status).toBe(400);
    expect((await answer('/library/albums', 'by=path&group=rock')).status).toBe(400);
    expect(((await (await answer('/library/albums', '')).json()) as { total: number }).total).toBe(2);
  });

  it('serves nothing before the database is connected', async () => {
    expect((await libraryRoutes['/library/groups'](undefined, new URLSearchParams('by=artist'))).status).toBe(403);
  });
});
