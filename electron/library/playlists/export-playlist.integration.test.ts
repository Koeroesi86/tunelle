import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'sqlite3';
import addTrack from '../scan/add-track';
import { createTestDatabase } from '../../test-database';
import { addEntries, getPlaylists, renamePlaylist, setPlaylistSync } from '../../repositories/playlist-repository';
import { exportPlaylist, writeBackPlaylist } from './export-playlist';
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

  const importMix = async (content: string) => {
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

  it('writes a change back only when the sync is on, keeps the first file as .bak, and the scan does not read the write as an edit', async () => {
    const { file, id } = await importMix('../one.flac\n');
    await addEntries(database, id, [{ path: inFolder('two.flac'), snapshot: track(inFolder('two.flac'), 'Two') }]);

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
});
