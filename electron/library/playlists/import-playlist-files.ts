import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'sqlite3';
import type { PlaylistImportReport } from '@shared/types/playlists';
import {
  addEntries,
  createImportedPlaylist,
  getImportedPlaylists,
  getPlaylistNames,
  replaceImportedEntries,
  touchImportedPlaylist,
} from '../../repositories/playlist-repository';
import { getLibraryPaths, getTrackListByPaths } from '../../repositories/library-repository';
import normalizePath from '../../utils/normalize-path';
import { decodePlaylist } from './decode-playlist';
import { createLibraryIndex, findInLibrary } from './library-index';
import type { LibraryIndex } from './library-index';
import { parsePlaylist } from './parse-playlist';
import { isPlaylistFile, playlistFormatOf } from './playlist-files';
import type { PlaylistFormat } from './playlist-files';
import type { ParsedEntry } from './playlist-types';
import { resolveLocation } from './resolve-location';

const logImportError = (filePath: string) => (error: unknown) => {
  console.error(`Importing the playlist ${filePath} failed`, error);
  return undefined;
};

const checksumOf = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

const unusedName = (wanted: string, taken: string[], folderName: string) => {
  const candidates = [wanted, `${wanted} (${folderName})`, ...Array.from({ length: taken.length + 1 }, (_, index) => `${wanted} (${index + 2})`)];
  return candidates.find((candidate) => !taken.includes(candidate)) ?? wanted;
};

const snapshotOfUnmatched = (entry: ParsedEntry, filePath: string) => ({
  path: filePath,
  title: entry.title ?? path.posix.basename(filePath, path.posix.extname(filePath)),
  artist: entry.artist,
  album: entry.album,
  duration: entry.duration,
});

type Imported = Pick<PlaylistImportReport, 'unmatched' | 'streams'> & { tracks: { path: string; snapshot: unknown }[] };

const toTracks = async (database: Database, entries: ParsedEntry[], playlistFolder: string, index: LibraryIndex): Promise<Imported> => {
  const resolved = entries.map((entry) => ({ entry, location: resolveLocation(entry.location, playlistFolder) }));
  const files = resolved.flatMap(({ entry, location }) =>
    location?.kind === 'file' ? [{ entry, filePath: location.path, libraryPath: findInLibrary(index, location.path) }] : []
  );
  const known = new Map(
    (await getTrackListByPaths(database, [...new Set(files.flatMap(({ libraryPath }) => (libraryPath ? [libraryPath] : [])))])).map((track) => [
      track.path,
      track,
    ])
  );

  return {
    tracks: files.map(({ entry, filePath, libraryPath }) => {
      const track = libraryPath ? known.get(libraryPath) : undefined;
      return track ? { path: track.path, snapshot: track } : { path: filePath, snapshot: snapshotOfUnmatched(entry, filePath) };
    }),
    unmatched: files.flatMap(({ entry, libraryPath }) => (libraryPath && known.has(libraryPath) ? [] : [{ location: entry.location, title: entry.title }])),
    streams: resolved.filter(({ location }) => location?.kind === 'stream').length,
  };
};

type ImportedPlaylist = Awaited<ReturnType<typeof getImportedPlaylists>>[number];

interface Context {
  database: Database;
  index: LibraryIndex;
  imported: Map<string, ImportedPlaylist>;
}

const reportOf = (fileName: string, name: string, status: PlaylistImportReport['status'], content?: Imported): PlaylistImportReport => ({
  fileName,
  name,
  status,
  imported: content?.tracks.length ?? 0,
  unmatched: content?.unmatched ?? [],
  streams: content?.streams ?? 0,
});

const importFromHandle = async ({ database, index, imported }: Context, handle: fs.promises.FileHandle, filePath: string, format: PlaylistFormat) => {
  const sourcePath = normalizePath(filePath);
  const modified = Math.floor((await handle.stat()).mtimeMs);
  const existing = imported.get(sourcePath);
  if (existing?.modified === modified) return reportOf(sourcePath, existing.name, 'unchanged');

  const buffer = await handle.readFile();
  const checksum = checksumOf(buffer);
  if (existing?.checksum === checksum) {
    await touchImportedPlaylist(database, existing.id, modified);
    return reportOf(sourcePath, existing.name, 'unchanged');
  }

  const { text, encoding } = decodePlaylist(buffer);
  const parsed = parsePlaylist(format, text);
  const content = await toTracks(database, parsed.entries, path.posix.dirname(sourcePath), index);
  const source = { path: sourcePath, checksum, modified, encoding };

  if (existing) {
    await replaceImportedEntries(database, existing.id, source, content.tracks);
    return reportOf(sourcePath, existing.name, 'updated', content);
  }

  const wanted = parsed.title ?? path.posix.basename(sourcePath, path.posix.extname(sourcePath));
  const name = unusedName(wanted, await getPlaylistNames(database), path.posix.basename(path.posix.dirname(sourcePath)));
  const id = await createImportedPlaylist(database, name, source);
  if (id !== undefined) await addEntries(database, id, content.tracks);
  return reportOf(sourcePath, name, 'created', content);
};

/** The time and the content are read from the one open file, so they are of the same file */
const importFile = async (context: Context, filePath: string, format: PlaylistFormat) => {
  const handle = await fs.promises.open(filePath, 'r');
  return importFromHandle(context, handle, filePath, format).finally(() => handle.close());
};

/** Read the playlist files and store what they say, a playlist for each file: new ones are created, one that was imported from the file is changed when its content is (the file wins over what was done to the playlist in the app) and is left alone when it is not. A file that cannot be read or stored is logged and left out of the reports. See docs/app/playlist-import.md */
export const importPlaylistFiles = async (database: Database, filePaths: string[]): Promise<PlaylistImportReport[]> => {
  const context = {
    database,
    index: createLibraryIndex(await getLibraryPaths(database)),
    imported: new Map((await getImportedPlaylists(database)).map((playlist) => [playlist.sourcePath, playlist])),
  };
  const reports: PlaylistImportReport[] = [];

  // one after the other: a name that is taken is taken by the playlist before
  for (const filePath of filePaths.filter(isPlaylistFile)) {
    const format = playlistFormatOf(filePath);
    const report = format ? await importFile(context, filePath, format).catch(logImportError(filePath)) : undefined;
    reports.push(...(report ? [report] : []));
  }

  return reports;
};
