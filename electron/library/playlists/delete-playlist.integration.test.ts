import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog, shell } from 'electron';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import { createTestDatabase } from '../../test-database';
import { getPlaylists } from '../../repositories/playlist-repository';
import { deletePlaylistAfterAsking } from './delete-playlist';
import { importPlaylistFiles } from './import-playlist-files';
import normalizePath from '../../utils/normalize-path';

// the dialog and the trash are the system: the trash is a folder here, and the notification of a failure is not shown
vi.mock('electron', () => ({
  app: { getLocale: () => 'en-US' },
  dialog: { showMessageBox: vi.fn() },
  shell: { trashItem: vi.fn() },
  Notification: class {
    static isSupported = () => false;
  },
}));

describe('deleting a playlist that has a file', () => {
  let database: Database;
  let folder: string;
  let trash: string;
  let file: string;
  const answer = (response: number) => vi.mocked(dialog.showMessageBox).mockResolvedValue({ response, checkboxChecked: false });
  const names = () => getPlaylists(database).then((playlists) => playlists.map(({ name }) => name));

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    database = await createTestDatabase();
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-delete-'));
    trash = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-trash-'));
    vi.mocked(shell.trashItem).mockImplementation((from) => fs.promises.rename(from, path.join(trash, path.basename(from))));
    file = path.join(folder, 'mix.m3u');
    await addTrack(database, {
      path: normalizePath(path.join(folder, 'one.flac')),
      artist: 'Band',
      album: 'Rec',
      title: 'One',
      year: '',
      track: '',
      disk: '',
      genre: '',
      picture: null,
      duration: null,
    });
    await fs.promises.writeFile(file, 'one.flac\n');
    await importPlaylistFiles(database, [file]);
  });

  afterEach(() => Promise.all([folder, trash].map((directory) => fs.promises.rm(directory, { recursive: true, force: true }))));

  const idOfMix = async () => (await getPlaylists(database))[0]?.id ?? -1;

  it('moves the file to the trash with the playlist, so the next scan has nothing to make it from', async () => {
    answer(0);

    await deletePlaylistAfterAsking(database, null, await idOfMix());

    expect(await names()).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(trash, 'mix.m3u'))).toBe(true);
    expect(await importPlaylistFiles(database, [])).toEqual([]);
  });

  it('leaves the file with the playlist only deleted, and the next scan makes the playlist again, as the dialog warns', async () => {
    answer(1);

    await deletePlaylistAfterAsking(database, null, await idOfMix());
    expect(await names()).toEqual([]);

    const [report] = await importPlaylistFiles(database, [file]);
    expect(report).toMatchObject({ name: 'mix', status: 'created' });
    expect(await names()).toEqual(['mix']);
  });

  it('keeps the playlist and the file when it is cancelled, and the playlist when the file cannot be moved', async () => {
    const id = await idOfMix();
    answer(2);
    await deletePlaylistAfterAsking(database, null, id);

    answer(0);
    vi.mocked(shell.trashItem).mockRejectedValue(new Error('read only'));
    await deletePlaylistAfterAsking(database, null, id);

    expect(await names()).toEqual(['mix']);
    expect(fs.existsSync(file)).toBe(true);
  });
});
