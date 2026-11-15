import { createHash } from 'crypto';
import path from 'path';
import type { Database } from 'sqlite3';
import { isRecord } from '@shared/utils/is-record';
import { getImportedPlaylists, getPlaylists, markPlaylistWritten } from '../../repositories/playlist-repository';
import normalizePath from '../../utils/normalize-path';
import { encodePlaylist } from './encode-playlist';
import { formatPlaylist } from './format-playlist';
import type { ExportEntry } from './format-playlist';
import { playlistFormatOf } from './playlist-files';
import { writePlaylistFile } from './write-playlist-file';

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const toEntry = (entryPath: string, snapshot: unknown): ExportEntry => {
  const track = isRecord(snapshot) ? snapshot : {};
  return {
    path: entryPath,
    title: text(track.title),
    artist: text(track.artist),
    album: text(track.album),
    duration: typeof track.duration === 'number' ? track.duration : undefined,
  };
};

/** Write the playlist to the file, in the format of its extension: `.m3u8`, `.pls` and `.xspf` as UTF-8, `.m3u` in the encoding the file was read with when that can hold the text. Returns what was written, undefined for a playlist that is not there or an extension that is no format. See docs/app/playlist-export.md */
const writePlaylist = async (database: Database, id: number, filePath: string, wantedEncoding: string | undefined, backup: boolean) => {
  const format = playlistFormatOf(filePath);
  const playlist = (await getPlaylists(database)).find((candidate) => candidate.id === id);
  if (!format || !playlist) return undefined;

  const folder = path.posix.dirname(normalizePath(filePath));
  const content = formatPlaylist(format, { name: playlist.name, folder, entries: playlist.entries.map((entry) => toEntry(entry.path, entry.snapshot)) });
  const legacyAllowed = path.extname(filePath).toLowerCase() === '.m3u';
  const { buffer, encoding } = encodePlaylist(content, legacyAllowed ? wantedEncoding : undefined);
  const modified = await writePlaylistFile(filePath, buffer, backup);

  return { checksum: createHash('sha256').update(buffer).digest('hex'), modified, encoding };
};

/** Save a copy of the playlist as a file; the playlist itself is not tied to it */
export const exportPlaylist = async (database: Database, id: number, filePath: string) => {
  await writePlaylist(database, id, filePath, undefined, true);
};

/** The playlist was changed in the app and is kept in sync with its file: write it, and store what was written so the scan does not read the write as an edit. Does nothing for a playlist without a file or with the sync off. See docs/app/playlist-export.md */
export const writeBackPlaylist = async (database: Database, id: number) => {
  const linked = (await getImportedPlaylists(database)).find((playlist) => playlist.id === id && playlist.sync);
  const written = linked ? await writePlaylist(database, id, linked.sourcePath, linked.encoding ?? undefined, true) : undefined;
  if (written) await markPlaylistWritten(database, id, written);
};
