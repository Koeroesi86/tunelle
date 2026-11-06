import path from 'path';
import type { Track } from '@shared/types/library';
import { isInsideFolder } from '../watch/folder-availability';
import { mountGuard } from '../mounts/mount-guard';
import { mapAsync } from '@shared/utils/map-async';

const directoriesInFlight = 16;

/** The names in a directory: undefined when it does not answer or cannot be read for another reason than that it is gone, none when it is gone */
const readNames = async (mount: string, directory: string) => {
  const { names, code } = await mountGuard().list(mount, directory);
  if (names) return new Set(names);
  return code === 'ENOENT' || code === 'ENOTDIR' ? new Set<string>() : undefined;
};

/** The library folder a directory is in, the directory itself when it is in none */
const mountOf = (folders: string[], directory: string) => folders.find((folder) => isInsideFolder(folder, `${directory}/`)) ?? directory;

/** The tracks whose file is gone; a directory is read by the process of the library folder it is in (`folders`). A directory is read once for all its tracks, not a call for each track. A track in a directory that does not answer or cannot be read is kept: only a file that is reported missing is removed */
export const findMissingTracks = async <T extends Pick<Track, 'path'>>(tracks: T[], folders: string[]) => {
  // the scan stores the paths with forward slashes
  // the directory of a file at the root of a drive is the drive, which is the working directory of it for Windows until it ends with a slash
  const byDirectory = tracks.reduce((groups, track) => {
    const directory = path.posix.dirname(track.path).replace(/^([A-Za-z]:)$/, '$1/');
    const group = groups.get(directory) ?? [];
    group.push(track);
    return groups.set(directory, group);
  }, new Map<string, T[]>());
  const entries = [...byDirectory];
  const names = await mapAsync(entries, ([directory]) => readNames(mountOf(folders, directory), directory), { concurrency: directoriesInFlight });

  return entries.flatMap(([, inDirectory], index) => {
    const present = names[index];
    return present ? inDirectory.filter((track) => !present.has(path.posix.basename(track.path))) : [];
  });
};
