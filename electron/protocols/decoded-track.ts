import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { readdir, rename, rm, stat, utimes } from 'fs/promises';
import { join } from 'path';
import { isChromiumCodec, isDecodedCodec, isMixedCodec } from '../utils/is-supported';
import { logError } from '../utils/log-error';
import { cacheFolder, makeCacheFolder } from './cache-folder';
import { cacheLimit } from './decode-policy';
import { ffmpegProgram } from './ffmpeg-program';
import { isHeld } from './held-files';
import { toEncoder, type Format } from './pcm-encoder';
import { probeFormat } from './probe-audio';

// See docs/app/decoder-proxy.md for the cache, the sharing of a decode and what is spared by the eviction
const maxDecodes = 2;
const keptRecent = 3;

interface Job {
  done: Promise<string | undefined>;
  waiters: number;
  /** The waiting requests of the player, without the ones of the loudness measurement */
  players: number;
  /** When the player asked for it last, higher is later */
  asked: number;
  cancelled: boolean;
  child?: ChildProcess;
}

export interface PlayableTrack extends Format {
  path: string;
}

const jobs = new Map<string, Job>();
const queue: { job: Job; start: () => void }[] = [];
let running = 0;
let asks = 0;
let recent: string[] = [];

const takeSlot = (job: Job) => {
  if (running >= maxDecodes) return new Promise<void>((start) => queue.push({ job, start }));
  running += 1;
  return Promise.resolve();
};

const urgency = ({ players, asked }: Job) => (players > 0 ? asked : 0);

/** The player goes before the measurement, its newest request first; the others keep their order */
const freeSlot = () => {
  const [next] = [...queue].sort((a, b) => urgency(b.job) - urgency(a.job));
  if (!next) {
    running -= 1;
    return;
  }
  queue.splice(queue.indexOf(next), 1);
  next.start();
};

const runDecoder = (job: Job, source: string, encoder: string[], output: string) =>
  new Promise<boolean>((resolve) => {
    const child = spawn(
      ffmpegProgram(),
      // `-rf64 auto`: a WAV over 4 GiB gets 64 bit sizes
      [
        '-nostdin',
        '-v',
        'error',
        '-fflags',
        '+bitexact',
        '-i',
        source,
        '-map',
        '0:a:0',
        '-map_metadata',
        '-1',
        ...encoder,
        '-rf64',
        'auto',
        '-f',
        'wav',
        '-y',
        output,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
    );
    const errors: Buffer[] = [];
    job.child = child;
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', (error) => {
      logError(error);
      resolve(false);
    });
    child.on('close', (code) => {
      if (code !== 0 && !job.cancelled) logError(new Error(`ffmpeg failed on ${source}: ${Buffer.concat(errors).toString().trim()}`));
      resolve(code === 0);
    });
  });

/** Removes the oldest files of the cache until it fits, but not the files being written, being read, or served to the player last */
export const evict = async () => {
  const folder = cacheFolder('whole-decodes');
  const files = (
    await Promise.all(
      (await readdir(folder)).map((name) =>
        stat(join(folder, name)).then(
          ({ size, mtimeMs }) => ({ name, size, mtimeMs }),
          () => undefined
        )
      )
    )
  ).filter((file) => file !== undefined);
  // the copy and every part file of a key start with it
  const live = new Set([...jobs.keys(), ...recent]);
  const idle = files.filter(({ name }) => !live.has(name.split('.')[0]) && !isHeld(join(folder, name))).sort((a, b) => a.mtimeMs - b.mtimeMs);
  const total = files.reduce((sum, { size }) => sum + size, 0);

  await Promise.all(
    idle
      .filter((_, index) => total - idle.slice(0, index).reduce((sum, { size }) => sum + size, 0) > cacheLimit)
      .map(({ name }) => rm(join(folder, name), { force: true }))
  );
};

const writeDecoded = async (job: Job, source: string, encoder: string[], target: string) => {
  await makeCacheFolder('whole-decodes');
  if (job.cancelled) return undefined;
  // each job writes under its own name and renames at the end: a file of the cache is whole, and a cancelled job can not touch its retry
  const output = `${target}.${randomUUID()}.part`;
  const decoded = await runDecoder(job, source, encoder, output);
  if (!decoded || job.cancelled) {
    await rm(output, { force: true });
    return undefined;
  }
  await rename(output, target);
  await evict().catch(logError);
  return target;
};

const produce = async (job: Job, source: string, encoder: string[], target: string) => {
  await takeSlot(job);
  return writeDecoded(job, source, encoder, target).finally(freeSlot);
};

const startJob = (key: string, source: string, encoder: string[], target: string) => {
  const job: Job = { done: Promise.resolve(undefined), waiters: 0, players: 0, asked: 0, cancelled: false };
  job.done = produce(job, source, encoder, target)
    .catch((error) => {
      logError(error);
      return undefined;
    })
    .finally(() => {
      if (jobs.get(key) === job) jobs.delete(key);
    });
  jobs.set(key, job);
  return job;
};

const cancel = (key: string, job: Job) => {
  job.cancelled = true;
  job.child?.kill();
  if (jobs.get(key) === job) jobs.delete(key);
};

/** The decode stops when no request waits for it any more */
const leave = (key: string, job: Job, measured: boolean) => {
  job.waiters -= 1;
  if (!measured) job.players -= 1;
  if (job.waiters === 0) cancel(key, job);
};

/** Ends the running and the waiting decodes as the app quits: an ffmpeg that writes a file would go on without the app */
export const stopDecodes = () => jobs.forEach((job, key) => cancel(key, job));

/** What ffprobe said of each file that was asked about, so the ranges of a track do not ask again */
const floatFiles = new Map<string, boolean>();

/** Float samples under a codec that holds integers too, which both have a depth of 32 bit: only the file tells */
const isFloatFile = async (source: string, version: string, { codec, bitDepth }: Format) => {
  if (!isMixedCodec(codec) || (bitDepth ?? 0) < 32) return false;
  const float = floatFiles.get(version) ?? (await probeFormat(source))?.float;
  if (float !== undefined) floatFiles.set(version, float);
  return float === true;
};

/** What names the decoded copy of a source in the cache */
export const prepareDecode = async (
  source: string,
  format: Format
): Promise<{ key: string; encoder: string[]; volume: number; target: string } | undefined> => {
  const stats = await stat(source).catch(() => undefined);
  if (!stats?.isFile()) return undefined;

  const version = `${source}\0${stats.size}\0${stats.mtimeMs}`;
  const encoder = toEncoder(format, await isFloatFile(source, version, format));
  const key = createHash('sha256')
    .update(`${version}\0${encoder.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  return { key, encoder, volume: stats.dev, target: join(cacheFolder('whole-decodes'), `${key}.wav`) };
};

/** The decoded copy of the cache, with its time set to now so the eviction keeps it, undefined when there is none */
const cachedCopy = async (target: string) => {
  const found = await stat(target).then(
    () => true,
    () => false
  );
  if (found) await utimes(target, new Date(), new Date()).catch(() => undefined);
  return found ? target : undefined;
};

/** The copies of the last tracks that the player asked for stay: the one that plays, the next one and the previous one */
const markRecent = (key: string) => {
  recent = [key, ...recent.filter((kept) => kept !== key)].slice(0, keptRecent);
};

/** Decodes a track to a WAV file in the cache, once for all the requests that ask for it meanwhile, undefined when it fails or the request is gone */
export const decodeTrack = async (source: string, format: Format, signal: AbortSignal, measured = false) => {
  const prepared = signal.aborted ? undefined : await prepareDecode(source, format);
  if (!prepared) return undefined;

  // before the lookup: a file that another user put there is not served
  if (!(await makeCacheFolder('whole-decodes').catch(logError))) return undefined;

  const { key, encoder, target } = prepared;
  if (!measured) markRecent(key);
  const cached = await cachedCopy(target);
  // checked after the last await: a signal that has aborted never calls the listener, and the request would be counted forever
  if (cached || signal.aborted) return cached;

  const existing = jobs.get(key);
  const job = existing && !existing.cancelled ? existing : startJob(key, source, encoder, target);
  const onAbort = () => leave(key, job, measured);
  job.waiters += 1;
  if (!measured) {
    job.players += 1;
    job.asked = ++asks;
  }
  signal.addEventListener('abort', onAbort, { once: true });
  return job.done.finally(() => signal.removeEventListener('abort', onAbort));
};

/** The file the page gets for a track of the library: the file itself, or its decoded copy for a codec that Chromium does not play; a codec that Chromium plays too falls back to the file when the decode fails */
export const playableFile = async ({ path, ...format }: PlayableTrack, signal: AbortSignal, measured = false) => {
  if (!isDecodedCodec(format.codec)) return path;
  const decoded = await decodeTrack(path, format, signal, measured);
  return decoded ?? (isChromiumCodec(format.codec) && !signal.aborted ? path : undefined);
};
