import fs from 'fs';
import path from 'path';
import { withTimeout } from './folderAvailability';
import { mapInChunks } from './inChunks';
import type { Change } from './libraryChange';

type DirectoryTimes = Map<string, number>;

const directoriesInFlight = 16;

/** The modification time of a directory and the directories in it, undefined when it cannot be read or does not answer */
const readDirectory = (directory: string) =>
  withTimeout(
    Promise.all([fs.promises.stat(directory), fs.promises.readdir(directory, { withFileTypes: true })]).then(([stat, entries]) => ({
      time: Math.floor(stat.mtimeMs),
      directories: entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(directory, entry.name)),
    })),
    undefined
  );

/** The folder and the folders below it with their modification times, which change when a file in one is added, removed or renamed; a folder that cannot be read is left out, so none is returned for one that does not answer. A few folders are read at a time */
export const readDirectoryTimes = async (folder: string): Promise<DirectoryTimes> => {
  const times: DirectoryTimes = new Map();

  const visit = async (level: string[]): Promise<void> => {
    if (level.length === 0) return;

    const reads = await mapInChunks(level, directoriesInFlight, readDirectory);
    reads.forEach((read, index) => read && times.set(level[index], read.time));
    await visit(reads.flatMap((read) => read?.directories ?? []));
  };

  await visit([folder]);
  return times;
};

/** How long the folder takes to answer, in milliseconds; a folder that does not answer in time takes as long as the wait */
export const measureResponse = async (folder: string) => {
  const start = performance.now();
  await withTimeout(fs.promises.stat(folder), undefined);
  return performance.now() - start;
};

const minInterval = 30_000;
const maxInterval = 15 * 60_000;
const intervalPerResponseMs = 2000;

/** How long to wait before the next look at a folder, from how long it took to answer: a folder on the disk of the computer is looked at every half minute, one on a network or a removable drive less often, the slower the rarer, as a look at a tree of folders over such a drive takes time of its own and loads the drive */
export const pollInterval = (responseMs: number) => Math.min(maxInterval, Math.max(minInterval, Math.round(responseMs * intervalPerResponseMs)));

/** What differs between two looks: the folders with another time or that are new are scanned for their own files, a folder that is gone is looked at with what was below it */
const differences = (before: DirectoryTimes, after: DirectoryTimes): Change[] => [
  ...[...after].filter(([directory, time]) => before.get(directory) !== time).map(([directory]) => ({ path: directory, deep: false })),
  ...[...before.keys()].filter((directory) => !after.has(directory)).map((directory) => ({ path: directory, deep: true })),
];

interface Options {
  readTimes?: (folder: string) => Promise<DirectoryTimes>;
  /** How long a folder takes to answer, in milliseconds */
  measure?: (folder: string) => Promise<number>;
  /** How long to wait before the next look at a folder, from how long it took to answer */
  interval?: (responseMs: number) => number;
  /** The least time between two looks at all the folders, as the window asks every time it gets the focus */
  checkGap?: number;
}

interface Tracked {
  /** The modification times at the last look */
  baseline?: DirectoryTimes;
  timer?: NodeJS.Timeout;
  looking?: boolean;
}

/** Tells what changed in the folders by looking at the modification times of the folders in them, which change when a file in one is added, removed or renamed. It does not use a watch of the system: on Linux one over a big tree or a network drive blocks the app while it is made, and a network drive gives no events anyway. A folder is looked at again after a wait that follows how slowly it answers, and when the window asks */
export const createFolderWatcher = (onChange: (changes: Change[]) => void, options: Options = {}) => {
  const { readTimes = readDirectoryTimes, measure = measureResponse, interval = pollInterval, checkGap = 30_000 } = options;
  const tracked = new Map<string, Tracked>();
  let queue = Promise.resolve();
  let lastCheck = 0;
  let closed = false;

  const untrack = (folder: string) => {
    clearTimeout(tracked.get(folder)?.timer);
    tracked.delete(folder);
  };

  /** Wait for the next look, as long as the folder asks for with its last answer */
  const schedule = async (folder: string, entry: Tracked) => {
    const wait = interval(await measure(folder));
    if (closed || tracked.get(folder) !== entry) return;

    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void look(folder, entry), wait);
  };

  /** A folder that does not answer keeps what was seen of it */
  const compare = async (folder: string, entry: Tracked) => {
    const times = await readTimes(folder);
    if (times.size === 0) return;

    const { baseline } = entry;
    entry.baseline = times;
    const changes = baseline ? differences(baseline, times) : [];
    if (changes.length > 0) onChange(changes);
  };

  const look = async (folder: string, entry: Tracked) => {
    // the wait ended while the last look goes on
    if (entry.looking) return;

    entry.looking = true;
    await compare(folder, entry).finally(() => {
      entry.looking = false;
    });
    await schedule(folder, entry);
  };

  const track = async (folder: string) => {
    const baseline = await readTimes(folder);
    // a folder that does not answer is tried again with the next update
    if (closed || baseline.size === 0) return;

    const entry: Tracked = { baseline };
    tracked.set(folder, entry);
    await schedule(folder, entry);
  };

  const apply = async (folders: string[]) => {
    [...tracked.keys()].filter((folder) => !folders.includes(folder)).forEach(untrack);
    await Promise.all(folders.filter((folder) => !tracked.has(folder)).map(track));
  };

  /** Look at the folders now, unless it was done a moment ago */
  const check = async () => {
    if (Date.now() - lastCheck < checkGap) return;

    lastCheck = Date.now();
    await Promise.all([...tracked].map(([folder, entry]) => look(folder, entry)));
  };

  return {
    /** Keep exactly these folders: a look at each now and then */
    update: (folders: string[]) => {
      queue = queue.then(() => apply(folders)).catch((e) => console.error(e));
      return queue;
    },
    check,
    close: () => {
      closed = true;
      [...tracked.keys()].forEach(untrack);
    },
  };
};
