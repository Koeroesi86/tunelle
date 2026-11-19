import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import type { WebContents } from 'electron';
import addTrack from '../../scan/add-track';
import { createTestDatabase } from '../../../test-database';
import { addEntries, createPlaylist } from '../../../repositories/playlist-repository';
import { sendPlaylists } from './send-playlists';

const track = (trackPath: string, title: string) => ({
  path: trackPath,
  artist: 'Band',
  album: 'Rec',
  title,
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
});

describe('sending the playlists', () => {
  let database: Database;
  const send = vi.fn();
  const sender = { send, isDestroyed: () => false } as unknown as WebContents;

  beforeEach(async () => {
    send.mockReset();
    database = await createTestDatabase();
  });

  it('shows an entry that the library did not have as it is in the file, and from the library once the track is there', async () => {
    const id = (await createPlaylist(database, 'Mix')) ?? -1;
    await addEntries(database, id, [
      { path: '/m/new.flac', snapshot: { path: '/m/new.flac', title: 'From the file', artist: 'Band', album: '', duration: 10 } },
    ]);

    await sendPlaylists(database, sender);
    await addTrack(database, track('/m/new.flac', 'From the library'));
    await sendPlaylists(database, sender);

    const [before, after] = send.mock.calls.map(([, message]) => message.playlists[0].entries[0]);
    expect(before).toMatchObject({ available: false, track: { title: 'From the file' } });
    expect(after).toMatchObject({ available: true, track: { title: 'From the library', album: 'Rec' } });
  });

  it('keeps the snapshot of an entry whose track left the library', async () => {
    const id = (await createPlaylist(database, 'Mix')) ?? -1;
    await addEntries(database, id, [{ path: '/m/gone.flac', snapshot: track('/m/gone.flac', 'Gone') }]);

    await sendPlaylists(database, sender);

    expect(send.mock.calls[0]?.[1].playlists[0].entries[0]).toMatchObject({ available: false, track: { title: 'Gone' } });
  });
});
