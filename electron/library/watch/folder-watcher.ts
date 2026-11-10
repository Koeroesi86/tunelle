import path from 'path';
import { mountGuard } from '../mounts/mount-guard';
import type { Change } from './library-change';
import { clamp } from '@shared/utils/clamp';
import { logError } from '../../utils/log-error';
import { mapAsync } from '@shared/utils/map-async';
import { secondsSchema } from '../../schemas/environment';

type DirectoryTimes = Map<string, number>;

const directoriesInFlight = 16;

/** The modification time of a directory and the directories in it, undefined when it cannot be read or does not answer; asked of the process of the mount */
const readDirectory = async (mount: string, directory: string) => {
  const { time, directories } = await mountGuard().list(mount, directory);
  return time === undefined || directories === undefined ? undefined : { time, directories: directories.map((name) => path.join(directory, name)) };
};

/** The folder and the folders below it with their modification times, which change when a file in one is added, removed or renamed; a folder that cannot be read is left out, so none is returned for one that does not answer. A few folders are read at a time */
export const readDirectoryTimes = async (folder: string): Promise<DirectoryTimes> => {
  const times: DirectoryTimes = new Map();

  const visit = async (level: string[]): Promise<void> => {
    if (level.length === 0) return;

    const reads = await mapAsync(level, (directory) => readDirectory(folder, directory), { concurrency: directoriesInFlight });
    reads.forEach((read, index) => read && times.set(level[index], read.time));
    await visit(reads.flatMap((read) => read?.directories ?? []));
  };

  await visit([folder]);
  return times;
};

const defaultMinSeconds = 10;
const maxInterval = 15 * 60_000;
/** A look takes about one hundredth of the time */
const waitPerLookMs = 100;

/** The shortest wait between two looks at a folder, from `TUNELLE_WATCH_MIN_SECONDS` (10 s by default); what is not a number of seconds is the default */
const readMinInterval = (value = process.env.TUNELLE_WATCH_MIN_SECONDS) => secondsSchema(defaultMinSeconds).parse(value) * 1000;

/** How long to wait before the next look at a folder, from how long the last looks took (the whole tree of folders, a folder that does not answer takes the time it was waited for): a look takes about one hundredth of the time, so a small library on the disk of the computer is looked at every 10 seconds, a big tree or a network or removable drive less often, never rarer than every 15 minutes */
export const pollInterval = (lookMs: number) => clamp(Math.round(lookMs * waitPerLookMs), readMinInterval(), maxInterval);

/** What differs between two looks: the folders with another time or that are new are scanned for their own files, a folder that is gone is looked at with what was below it */
const differences = (before: DirectoryTimes, after: DirectoryTimes): Change[] => [
  ...[...after].filter(([directory, time]) => before.get(directory) !== time).map(([directory]) => ({ path: directory, deep: false })),
  ...[...before.keys()].filter((directory) => !after.has(directory)).map((directory) => ({ path: directory, deep: true })),
];

interface Options {
  readTimes?: (folder: string) => Promise<DirectoryTimes>;
  /** How long to wait before the next look at a folder, from how long the last looks took, in milliseconds */
  interval?: (lookMs: number) => number;
  /** The least time between two looks at all the folders, as the window asks every time it gets the focus */
  checkGap?: number;
}

interface Tracked {
  /** The modification times at the last look */
  baseline?: DirectoryTimes;
  /** How long the last two looks took: the longer one counts, so one look that was quick by luck does not shorten the wait */
  lookMs: number[];
  timer?: NodeJS.Timeout;
  looking?: boolean;
}

/** Tells what changed in the folders by looking at the modification times of the folders in them, which change when a file in one is added, removed or renamed. It does not use a watch of the system: on Linux one over a big tree or a network drive blocks the app while it is made, and a network drive gives no events anyway. A folder is looked at again after a wait that follows how long a look takes, and when the window asks */
export const createFolderWatcher = (onChange: (changes: Change[]) => void, options: Options = {}) => {
  const { readTimes = readDirectoryTimes, interval = pollInterval, checkGap = 30_000 } = options;
  const tracked = new Map<string, Tracked>();
  let queue = Promise.resolve();
  let lastCheck = 0;
  let closed = false;

  const untrack = (folder: string) => {
    clearTimeout(tracked.get(folder)?.timer);
    tracked.delete(folder);
  };

  /** Read the folders, and keep how long it took */
  const timedRead = async (folder: string, entry: Tracked) => {
    const start = performance.now();
    const times = await readTimes(folder);
    entry.lookMs = [...entry.lookMs.slice(-1), performance.now() - start];
    return times;
  };

  /** Wait for the next look, as long as the last looks ask for */
  const schedule = (folder: string, entry: Tracked) => {
    if (closed || tracked.get(folder) !== entry) return;

    const wait = interval(Math.max(...entry.lookMs));

    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void look(folder, entry), wait);
  };

  /** A folder that does not answer keeps what was seen of it */
  const compare = async (folder: string, entry: Tracked) => {
    const times = await timedRead(folder, entry);
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
    schedule(folder, entry);
  };

  const track = async (folder: string) => {
    const entry: Tracked = { lookMs: [] };
    const baseline = await timedRead(folder, entry);
    // a folder that does not answer is tried again with the next update
    if (closed || baseline.size === 0) return;

    entry.baseline = baseline;
    tracked.set(folder, entry);
    schedule(folder, entry);
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
      queue = queue.then(() => apply(folders)).catch(logError);
      return queue;
    },
    check,
    close: () => {
      closed = true;
      [...tracked.keys()].forEach(untrack);
    },
  };
};
