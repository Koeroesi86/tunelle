import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readdir, rename, rm, stat, utimes } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { isChromiumCodec, isDecodedCodec, isDsdCodec } from '../utils/is-supported';
import { logError } from '../utils/log-error';
import { cacheLimit } from './decode-policy';
import { ffmpegProgram } from './ffmpeg-program';

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

export interface Format {
  codec: string | null;
  bitDepth: number | null;
}

export interface PlayableTrack extends Format {
  path: string;
}

const jobs = new Map<string, Job>();
const queue: { job: Job; start: () => void }[] = [];
let running = 0;
let asks = 0;
let recent: string[] = [];

const cacheFolder = () => join(app.getPath('temp'), 'tunelle-whole-decodes');

/** Removes the cache of the earlier versions, which also kept copies of the codecs that are decoded in memory now */
export const removeOldCache = () => rm(join(app.getPath('temp'), 'tunelle-decoded'), { recursive: true, force: true }).catch(logError);

/** The WAV keeps the depth of the file, 16 bit when it is not known; DSD and DST, which have 1 bit, are 88.2 kHz and 24 bit whatever their rate. See docs/app/decoder-proxy.md */
const toEncoder = ({ codec, bitDepth }: Format) => {
  if (isDsdCodec(codec)) return ['-ar', '88200', '-c:a', 'pcm_s24le'];
  return ['-c:a', (bitDepth ?? 16) > 24 ? 'pcm_s32le' : (bitDepth ?? 16) > 16 ? 'pcm_s24le' : 'pcm_s16le'];
};

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
      ['-nostdin', '-v', 'error', '-fflags', '+bitexact', '-i', source, '-map', '0:a:0', '-map_metadata', '-1', ...encoder, '-f', 'wav', '-y', output],
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

/** Removes the oldest files of the cache until it fits, but not the files being written and the ones that were served last */
export const evict = async () => {
  const folder = cacheFolder();
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
  const idle = files.filter(({ name }) => !live.has(name.split('.')[0])).sort((a, b) => a.mtimeMs - b.mtimeMs);
  const total = files.reduce((sum, { size }) => sum + size, 0);

  await Promise.all(
    idle
      .filter((_, index) => total - idle.slice(0, index).reduce((sum, { size }) => sum + size, 0) > cacheLimit)
      .map(({ name }) => rm(join(folder, name), { force: true }))
  );
};

const writeDecoded = async (job: Job, source: string, encoder: string[], target: string) => {
  await mkdir(cacheFolder(), { recursive: true });
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

/** The decode stops when no request waits for it any more */
const leave = (key: string, job: Job, measured: boolean) => {
  job.waiters -= 1;
  if (!measured) job.players -= 1;
  if (job.waiters > 0) return;
  job.cancelled = true;
  job.child?.kill();
  if (jobs.get(key) === job) jobs.delete(key);
};

/** What names the decoded copy of a source in the cache, and marks the track as one of the last served */
export const prepareDecode = async (
  source: string,
  format: Format
): Promise<{ key: string; encoder: string[]; volume: number; target: string } | undefined> => {
  const stats = await stat(source).catch(() => undefined);
  if (!stats?.isFile()) return undefined;

  const encoder = toEncoder(format);
  const key = createHash('sha256')
    .update(`${source}\0${stats.size}\0${stats.mtimeMs}\0${encoder.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  recent = [key, ...recent.filter((kept) => kept !== key)].slice(0, keptRecent);
  return { key, encoder, volume: stats.dev, target: join(cacheFolder(), `${key}.wav`) };
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

/** Decodes a track to a WAV file in the cache, once for all the requests that ask for it meanwhile, undefined when it fails or the request is gone */
export const decodeTrack = async (source: string, format: Format, signal: AbortSignal, measured = false) => {
  const prepared = signal.aborted ? undefined : await prepareDecode(source, format);
  if (!prepared) return undefined;

  const { key, encoder, target } = prepared;
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
