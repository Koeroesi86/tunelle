import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, readdir, rename, rm, stat, utimes } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { isDecodedCodec } from '../utils/is-supported';
import { logError } from '../utils/log-error';

// See docs/app/decoder-proxy.md for the cache, the sharing of a decode and what is spared by the eviction
const cacheLimit = 2 * 1024 ** 3;
const maxDecodes = 2;
const keptRecent = 3;

interface Job {
  done: Promise<string | undefined>;
  waiters: number;
  cancelled: boolean;
  child?: ChildProcess;
}

interface Format {
  codec: string | null;
  bitDepth: number | null;
}

interface PlayableTrack extends Format {
  path: string;
}

const jobs = new Map<string, Job>();
const queue: (() => void)[] = [];
let running = 0;
let recent: string[] = [];

const cacheFolder = () => join(app.getPath('temp'), 'tunelle-decoded');

const ffmpegProgram = () =>
  join(
    app.isPackaged ? join(process.resourcesPath, 'ffmpeg') : join(app.getAppPath(), '..', '.cache', 'ffmpeg', 'install', 'bin'),
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );

/** The WAV keeps the depth of the file, 16 bit when it is not known; DSD, which has 1 bit, is 88.2 kHz and 24 bit whatever its rate. See docs/app/decoder-proxy.md */
const toEncoder = ({ codec, bitDepth }: Format) => {
  if (codec === 'DSD') return ['-ar', '88200', '-c:a', 'pcm_s24le'];
  return ['-c:a', (bitDepth ?? 16) > 24 ? 'pcm_s32le' : (bitDepth ?? 16) > 16 ? 'pcm_s24le' : 'pcm_s16le'];
};

const takeSlot = () => {
  if (running >= maxDecodes) return new Promise<void>((resolve) => queue.push(resolve));
  running += 1;
  return Promise.resolve();
};

const freeSlot = () => {
  const next = queue.shift();
  if (next) next();
  else running -= 1;
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
const evict = async () => {
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
  const busy = new Set([...jobs.keys(), ...recent].flatMap((key) => [`${key}.wav`, `${key}.wav.part`]));
  const idle = files.filter(({ name }) => !busy.has(name)).sort((a, b) => a.mtimeMs - b.mtimeMs);
  const total = files.reduce((sum, { size }) => sum + size, 0);

  await Promise.all(
    idle
      .filter((_, index) => total - idle.slice(0, index).reduce((sum, { size }) => sum + size, 0) > cacheLimit)
      .map(({ name }) => rm(join(folder, name), { force: true }))
  );
};

const writeDecoded = async (job: Job, source: string, encoder: string[], target: string) => {
  if (job.cancelled) return undefined;
  await mkdir(cacheFolder(), { recursive: true });
  // written under another name and renamed, so a file of the cache is always whole
  const output = `${target}.part`;
  if (!(await runDecoder(job, source, encoder, output))) {
    await rm(output, { force: true });
    return undefined;
  }
  await rename(output, target);
  await evict().catch(logError);
  return target;
};

const produce = async (job: Job, source: string, encoder: string[], target: string) => {
  await takeSlot();
  return writeDecoded(job, source, encoder, target).finally(freeSlot);
};

const startJob = (key: string, source: string, encoder: string[], target: string) => {
  const job: Job = { done: Promise.resolve(undefined), waiters: 0, cancelled: false };
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
const leave = (key: string, job: Job) => {
  job.waiters -= 1;
  if (job.waiters > 0) return;
  job.cancelled = true;
  job.child?.kill();
  if (jobs.get(key) === job) jobs.delete(key);
};

/** Decodes a track to a WAV file in the cache, once for all the requests that ask for it meanwhile, undefined when it fails or the request is gone */
export const decodeTrack = async (source: string, format: Format, signal: AbortSignal) => {
  const stats = await stat(source).catch(() => undefined);
  if (!stats?.isFile() || signal.aborted) return undefined;

  const encoder = toEncoder(format);
  const key = createHash('sha256')
    .update(`${source}\0${stats.size}\0${stats.mtimeMs}\0${encoder.join(' ')}`)
    .digest('hex')
    .slice(0, 32);
  const target = join(cacheFolder(), `${key}.wav`);
  recent = [key, ...recent.filter((kept) => kept !== key)].slice(0, keptRecent);

  if (
    await stat(target).then(
      () => true,
      () => false
    )
  ) {
    await utimes(target, new Date(), new Date()).catch(() => undefined);
    return target;
  }

  const existing = jobs.get(key);
  const job = existing && !existing.cancelled ? existing : startJob(key, source, encoder, target);
  const onAbort = () => leave(key, job);
  job.waiters += 1;
  signal.addEventListener('abort', onAbort, { once: true });
  return job.done.finally(() => signal.removeEventListener('abort', onAbort));
};

/** The file the page gets for a track of the library: the file itself, or its decoded copy for a codec that Chromium does not play */
export const playableFile = ({ path, ...format }: PlayableTrack, signal: AbortSignal) =>
  isDecodedCodec(format.codec) ? decodeTrack(path, format, signal) : Promise.resolve(path);
