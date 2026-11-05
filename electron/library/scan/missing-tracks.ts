import fs from 'fs';
import path from 'path';
import type { Track } from '@shared/types/library';
import { withTimeout } from '../watch/folder-availability';
import { mapInChunks } from '../../database/in-chunks';

const directoriesInFlight = 16;

/** The names in a directory: undefined when it does not answer or cannot be read for another reason than that it is gone, none when it is gone */
const readNames = (directory: string) =>
  withTimeout(
    fs.promises.readdir(directory).then(
      (names) => new Set(names),
      (e) => (e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? new Set<string>() : undefined)
    ),
    undefined
  );

/** The tracks whose file is gone. A directory is read once for all its tracks, not a call for each track. A track in a directory that does not answer or cannot be read is kept: only a file that is reported missing is removed */
export const findMissingTracks = async <T extends Pick<Track, 'path'>>(tracks: T[]) => {
  // the scan stores the paths with forward slashes
  // the directory of a file at the root of a drive is the drive, which is the working directory of it for Windows until it ends with a slash
  const byDirectory = tracks.reduce((groups, track) => {
    const directory = path.posix.dirname(track.path).replace(/^([A-Za-z]:)$/, '$1/');
    const group = groups.get(directory) ?? [];
    group.push(track);
    return groups.set(directory, group);
  }, new Map<string, T[]>());
  const entries = [...byDirectory];
  const names = await mapInChunks(entries, directoriesInFlight, ([directory]) => readNames(directory));

  return entries.flatMap(([, inDirectory], index) => {
    const present = names[index];
    return present ? inDirectory.filter((track) => !present.has(path.posix.basename(track.path))) : [];
  });
};
