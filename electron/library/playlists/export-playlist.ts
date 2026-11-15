import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import { isRecord } from '@shared/utils/is-record';
import { getImportedPlaylists, getPlaylists, markPlaylistWritten, relinkPlaylistFile } from '../../repositories/playlist-repository';
import normalizePath from '../../utils/normalize-path';
import { encodePlaylist } from './encode-playlist';
import { formatPlaylist } from './format-playlist';
import type { ExportEntry } from './format-playlist';
import { playlistFormatOf } from './playlist-files';
import { retirePlaylistFile, writePlaylistFile } from './write-playlist-file';

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

/** A write that did not happen: the file cannot be written (`failed`), or the text has characters the encoding of the file does not have (`encoding`) */
export class PlaylistWriteError extends Error {
  constructor(
    readonly filePath: string,
    readonly kind: 'failed' | 'encoding',
    cause?: unknown
  ) {
    super(`Writing the playlist ${filePath} failed: ${kind}`, { cause });
  }
}

/** Write the playlist to the file, in the format of its extension: `.m3u8`, `.pls` and `.xspf` as UTF-8, `.m3u` in the encoding the file was read with, which must have every character of it. Returns what was written, undefined for a playlist that is not there or an extension that is no format; throws a PlaylistWriteError. See docs/app/playlist-export.md */
const writePlaylist = async (database: Database, id: number, filePath: string, wantedEncoding: string | undefined, backup: boolean) => {
  const format = playlistFormatOf(filePath);
  const playlist = (await getPlaylists(database)).find((candidate) => candidate.id === id);
  if (!format || !playlist) return undefined;

  const folder = path.posix.dirname(normalizePath(filePath));
  const content = formatPlaylist(format, { name: playlist.name, folder, entries: playlist.entries.map((entry) => toEntry(entry.path, entry.snapshot)) });
  const encoded = encodePlaylist(content, path.extname(filePath).toLowerCase() === '.m3u' ? wantedEncoding : undefined);
  if (!encoded) throw new PlaylistWriteError(filePath, 'encoding');

  const modified = await writePlaylistFile(filePath, encoded.buffer, backup).catch((error: unknown) => {
    throw new PlaylistWriteError(filePath, 'failed', error);
  });

  return { checksum: createHash('sha256').update(encoded.buffer).digest('hex'), modified, encoding: encoded.encoding };
};

/** Save a copy of the playlist as a file; the playlist itself is not tied to it */
export const exportPlaylist = async (database: Database, id: number, filePath: string) => {
  await writePlaylist(database, id, filePath, undefined, true);
};

/** The playlist was changed in the app and is kept in sync with its file: write it, and store what was written so the scan does not read the write as an edit. Does nothing for a playlist without a file or with the sync off; throws a PlaylistWriteError. See docs/app/playlist-export.md */
export const writeBackPlaylist = async (database: Database, id: number) => {
  const linked = (await getImportedPlaylists(database)).find((playlist) => playlist.id === id && playlist.sync);
  const written = linked ? await writePlaylist(database, id, linked.sourcePath, linked.encoding ?? undefined, true) : undefined;
  if (written) await markPlaylistWritten(database, id, written);
};

/** The user took the offer to write the playlist as `.m3u8` instead of `.m3u`: the file is written beside the old one, the playlist is linked to it, and the old one is kept as `.bak` and no longer there, so the scan does not import it again. A name that is taken fails. See docs/app/playlist-export.md */
export const switchToM3u8 = async (database: Database, id: number) => {
  const linked = (await getImportedPlaylists(database)).find((playlist) => playlist.id === id);
  if (!linked) return;

  const target = linked.sourcePath.replace(/\.m3u$/i, '.m3u8');
  const taken =
    target === linked.sourcePath ||
    (await fs.promises.access(target).then(
      () => true,
      () => false
    ));
  if (taken) throw new PlaylistWriteError(target, 'failed', new Error('There is a file with that name'));

  const written = await writePlaylist(database, id, target, undefined, false);
  if (!written) return;
  await relinkPlaylistFile(database, id, { path: target, ...written });
  await retirePlaylistFile(linked.sourcePath).catch((error: unknown) => {
    throw new PlaylistWriteError(linked.sourcePath, 'failed', error);
  });
};
