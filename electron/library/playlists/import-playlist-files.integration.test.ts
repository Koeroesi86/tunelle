import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import { createTestDatabase } from '../../test-database';
import { deleteTracksInside } from '../../repositories/library-repository';
import { addEntries, getPlaylists, renamePlaylist } from '../../repositories/playlist-repository';
import { importPlaylistFiles } from './import-playlist-files';
import { removeVanishedPlaylists, settlePlaylistsOfRemovedFolder } from './imported-playlists';
import normalizePath from '../../utils/normalize-path';

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

describe('importing playlist files', () => {
  let database: Database;
  let folder: string;
  const inFolder = (...segments: string[]) => normalizePath(path.join(folder, ...segments));

  beforeEach(async () => {
    database = await createTestDatabase();
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-playlists-'));
    await fs.promises.mkdir(path.join(folder, 'lists'));
    await Promise.all([addTrack(database, track(inFolder('one.flac'), 'One')), addTrack(database, track(inFolder('two.flac'), 'Two'))]);
  });

  afterEach(() => fs.promises.rm(folder, { recursive: true, force: true }));

  const write = (name: string, content: string | Buffer) => fs.promises.writeFile(path.join(folder, name), content).then(() => path.join(folder, name));

  it('creates a playlist with the tracks of the library, keeps the ones it does not have and skips the network addresses', async () => {
    const file = await write('lists/mix.m3u', '#EXTINF:10,Band - Gone\n../gone.flac\n../one.flac\nhttp://radio.example/live\n../TWO.FLAC\n');

    const [report] = await importPlaylistFiles(database, [file]);
    const [playlist] = await getPlaylists(database);

    expect(report).toMatchObject({ name: 'mix', status: 'created', imported: 3, streams: 1, unmatched: [{ location: '../gone.flac', title: 'Gone' }] });
    expect(playlist?.entries.map((entry) => entry.path)).toEqual([inFolder('gone.flac'), inFolder('one.flac'), inFolder('two.flac')]);
    expect(playlist?.entries[1]?.snapshot).toMatchObject({ title: 'One' });
    expect(playlist?.entries[0]?.snapshot).toMatchObject({ title: 'Gone', artist: 'Band' });
  });

  it('leaves a file alone that did not change, also when only its time did, and lets a changed file win', async () => {
    const file = await write('lists/mix.m3u', '../one.flac\n');
    await importPlaylistFiles(database, [file]);
    const [playlist] = await getPlaylists(database);

    await fs.promises.utimes(file, new Date(), new Date(Date.now() + 5000));
    expect((await importPlaylistFiles(database, [file]))[0]?.status).toBe('unchanged');

    await fs.promises.writeFile(file, '../two.flac\n../one.flac\n');
    expect((await importPlaylistFiles(database, [file]))[0]).toMatchObject({ status: 'updated', imported: 2, name: 'mix' });

    const playlists = await getPlaylists(database);
    expect(playlists).toHaveLength(1);
    expect(playlists[0]?.id).toBe(playlist?.id);
    expect(playlists[0]?.entries.map((entry) => entry.path)).toEqual([inFolder('two.flac'), inFolder('one.flac')]);
  });

  it('names a second playlist with the same name after its folder, and reads a Windows 1250 file', async () => {
    await fs.promises.mkdir(path.join(folder, 'other'));
    const first = await write('lists/mix.pls', '[playlist]\nFile1=../one.flac\n');
    const second = await write('other/mix.xspf', '<playlist><trackList><track><location>file:///nowhere/ő.flac</location></track></trackList></playlist>');
    const legacy = await write('lists/régi.m3u', Buffer.from([0xf5, 0x2e, 0x66, 0x6c, 0x61, 0x63, 0x0a]));

    const reports = await importPlaylistFiles(database, [first, second, legacy]);

    expect(reports.map(({ name }) => name)).toEqual(['mix', 'mix (other)', 'régi']);
    // the character is the one of the code page of the system the test runs on, and one character that is not the replacement one
    expect((await getPlaylists(database))[2]?.entries[0]?.snapshot).toMatchObject({ title: expect.stringMatching(/^[^\uFFFD]$/u) });
  });

  it('removes the playlist of a file that is gone from a scanned folder, and not one of a file elsewhere', async () => {
    const inside = await write('lists/mix.m3u', '../one.flac\n');
    await fs.promises.mkdir(path.join(folder, 'elsewhere'));
    const outside = await write('elsewhere/other.m3u', '../one.flac\n');
    await importPlaylistFiles(database, [inside, outside]);
    await fs.promises.rm(inside);

    expect(await removeVanishedPlaylists(database, path.join(folder, 'lists'), true, [])).toBe(1);
    expect((await getPlaylists(database)).map(({ name }) => name)).toEqual(['other']);
  });

  it('settles the playlists of a removed folder: one with no track left goes, one with a track of another folder stays without the file', async () => {
    await addTrack(database, track('/elsewhere/three.flac', 'Three'));
    const gone = await write('lists/gone.m3u', '../one.flac\n');
    const stays = await write('lists/stays.m3u', '../one.flac\n/elsewhere/three.flac\n');
    await importPlaylistFiles(database, [gone, stays]);
    await deleteTracksInside(database, folder);

    await settlePlaylistsOfRemovedFolder(database, folder);

    expect((await getPlaylists(database)).map(({ name }) => name)).toEqual(['stays']);
    expect(await removeVanishedPlaylists(database, folder, true, [])).toBe(0);
  });

  it('lets the file win over what was done to the playlist in the app, and keeps the name the user gave it', async () => {
    const file = await write('lists/mix.m3u', '../one.flac\n');
    await importPlaylistFiles(database, [file]);
    const [playlist] = await getPlaylists(database);
    await addEntries(database, playlist?.id ?? -1, [{ path: inFolder('two.flac'), snapshot: track(inFolder('two.flac'), 'Two') }]);
    await renamePlaylist(database, playlist?.id ?? -1, 'My mix');

    await fs.promises.writeFile(file, '../two.flac\n');
    // a rewrite in the same tick of the clock keeps the modified time (and the size), and the import takes the file for unchanged
    await fs.promises.utimes(file, new Date(), new Date(Date.now() + 5000));
    const [report] = await importPlaylistFiles(database, [file]);

    const [after] = await getPlaylists(database);
    expect(report).toMatchObject({ status: 'updated', name: 'My mix' });
    expect(after).toMatchObject({ id: playlist?.id, name: 'My mix' });
    expect(after?.entries.map((entry) => entry.path)).toEqual([inFolder('two.flac')]);
  });

  it('names a playlist after the title in its file, and takes a file with an upper case extension', async () => {
    const m3u = await write('lists/ONE.M3U', '#EXTM3U\n#PLAYLIST:Late night\n../one.flac\n');
    const xspf = await write(
      'lists/two.xspf',
      '<playlist><title>Road trip</title><trackList><track><location>../two.flac</location></track></trackList></playlist>'
    );

    const reports = await importPlaylistFiles(database, [m3u, xspf]);

    expect(reports.map(({ name, status }) => [name, status])).toEqual([
      ['Late night', 'created'],
      ['Road trip', 'created'],
    ]);
    expect((await getPlaylists(database)).map(({ entries }) => entries.map((entry) => entry.path))).toEqual([[inFolder('one.flac')], [inFolder('two.flac')]]);
  });

  it('logs a file that cannot be read, leaves it out of the reports, and imports the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await fs.promises.mkdir(path.join(folder, 'lists', 'broken.m3u'));
    const good = await write('lists/good.m3u', '../one.flac\n');

    const reports = await importPlaylistFiles(database, [path.join(folder, 'lists', 'broken.m3u'), good]);

    expect(reports.map(({ name }) => name)).toEqual(['good']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('broken.m3u'), expect.anything());
  });

  it('takes the files of a folder only, and not the ones below it, when the scan is not deep', async () => {
    const below = await write('lists/below.m3u', '../one.flac\n');
    const direct = await write('direct.m3u', 'one.flac\n');
    await importPlaylistFiles(database, [below, direct]);
    await Promise.all([fs.promises.rm(below), fs.promises.rm(direct)]);

    expect(await removeVanishedPlaylists(database, folder, false, [])).toBe(1);
    expect((await getPlaylists(database)).map(({ name }) => name)).toEqual(['below']);
    expect(await removeVanishedPlaylists(database, folder, true, [])).toBe(1);
  });
});
