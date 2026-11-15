import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import { createTestDatabase } from '../../test-database';
import { addEntries, getPlaylists, renamePlaylist, setPlaylistSync } from '../../repositories/playlist-repository';
import { PlaylistWriteError, exportPlaylist, switchToM3u8, writeBackPlaylist } from './export-playlist';
import { importPlaylistFiles } from './import-playlist-files';
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
  duration: 12,
});

describe('exporting a playlist and writing it back', () => {
  let database: Database;
  let folder: string;
  const inFolder = (...segments: string[]) => normalizePath(path.join(folder, ...segments));
  const read = (...segments: string[]) => fs.promises.readFile(path.join(folder, ...segments), 'utf-8');

  beforeEach(async () => {
    database = await createTestDatabase();
    folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tunelle-export-'));
    await fs.promises.mkdir(path.join(folder, 'lists'));
    await Promise.all([addTrack(database, track(inFolder('one.flac'), 'One')), addTrack(database, track(inFolder('two.flac'), 'Two'))]);
  });

  afterEach(() => fs.promises.rm(folder, { recursive: true, force: true }));

  const importMix = async (content: string | Buffer) => {
    const file = path.join(folder, 'lists', 'mix.m3u');
    await fs.promises.writeFile(file, content);
    await importPlaylistFiles(database, [file]);
    return { file, id: (await getPlaylists(database))[0]?.id ?? -1 };
  };

  it('exports a playlist in the format of the file name, and what is exported imports back to the same entries', async () => {
    const { id } = await importMix('../one.flac\n../two.flac\n');
    const target = path.join(folder, 'lists', 'copy.xspf');

    await exportPlaylist(database, id, target);
    await importPlaylistFiles(database, [target]);

    const [, copy] = await getPlaylists(database);
    expect(await read('lists', 'copy.xspf')).toContain('<location>file://');
    expect(copy?.entries.map((entry) => entry.path)).toEqual([inFolder('one.flac'), inFolder('two.flac')]);
  });

  it('writes a change back of an imported playlist as it is on by default and not when it is turned off, keeps the first file as .bak, and the scan does not read the write as an edit', async () => {
    const { file, id } = await importMix('../one.flac\n');
    await addEntries(database, id, [{ path: inFolder('two.flac'), snapshot: track(inFolder('two.flac'), 'Two') }]);

    await setPlaylistSync(database, id, false);
    await writeBackPlaylist(database, id);
    expect(await read('lists', 'mix.m3u')).toBe('../one.flac\n');

    await setPlaylistSync(database, id, true);
    await writeBackPlaylist(database, id);
    await renamePlaylist(database, id, 'Renamed');
    await writeBackPlaylist(database, id);

    expect(await read('lists', 'mix.m3u')).toBe(
      `#EXTM3U\n#PLAYLIST:Renamed\n#EXTINF:12,Band - One\n${inFolder('one.flac')}\n#EXTINF:12,Band - Two\n${inFolder('two.flac')}\n`
    );
    expect(await read('lists', 'mix.m3u.bak')).toBe('../one.flac\n');
    expect((await importPlaylistFiles(database, [file]))[0]?.status).toBe('unchanged');
  });

  it('does not write an .m3u whose encoding lacks a character, and writes .m3u8 beside it when asked, linked and with the old file as .bak', async () => {
    await addTrack(database, track(inFolder('中.flac'), '中'));
    // the byte 0xe9 is not valid UTF-8, so the file is read in the legacy encoding of the system
    const original = Buffer.from([...Buffer.from('#EXTINF:1,caf'), 0xe9, ...Buffer.from('\n../one.flac\n')]);
    const { file, id } = await importMix(original);
    await addEntries(database, id, [{ path: inFolder('中.flac'), snapshot: track(inFolder('中.flac'), '中') }]);

    await expect(writeBackPlaylist(database, id)).rejects.toMatchObject({ kind: 'encoding' });
    expect(await fs.promises.readFile(file)).toEqual(original);

    await switchToM3u8(database, id);

    expect(await read('lists', 'mix.m3u8')).toContain('中.flac');
    await expect(fs.promises.access(file)).rejects.toThrow();
    expect(await fs.promises.readFile(`${file}.bak`)).toEqual(original);
    expect((await importPlaylistFiles(database, [path.join(folder, 'lists', 'mix.m3u8')]))[0]?.status).toBe('unchanged');
    expect(await getPlaylists(database)).toHaveLength(1);
  });

  it('fails visibly when the file cannot be written, and does not take a name that is taken for the .m3u8', async () => {
    const { file, id } = await importMix('../one.flac\n');
    await fs.promises.writeFile(path.join(folder, 'lists', 'mix.m3u8'), 'other');
    await fs.promises.rm(file);
    await fs.promises.mkdir(file);

    await expect(writeBackPlaylist(database, id)).rejects.toBeInstanceOf(PlaylistWriteError);
    await expect(switchToM3u8(database, id)).rejects.toMatchObject({ kind: 'failed' });
    expect(await read('lists', 'mix.m3u8')).toBe('other');
  });
});
