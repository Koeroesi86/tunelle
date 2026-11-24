import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { mkdir, open, rename, rm, type FileHandle } from 'fs/promises';
import { dirname } from 'path';
import { isProgressiveCodec } from '../utils/is-supported';
import { logError } from '../utils/log-error';
import { cachedCopy, evict, freeSlot, jobs, prepareDecode, takeSlot, type Format, type PlayableTrack } from './decoded-track';
import { aheadBytes, idleStopMs, type SourceSpeed } from './decode-policy';
import { ffmpegProgram } from './ffmpeg-program';
import { probeAudio } from './probe-audio';
import { wavHeader, wavHeaderSize, wavSize, type WavLayout } from './wav-header';

// See docs/app/decoder-proxy.md: the WAV is served while ffmpeg writes it, with the size that the file will have
const readChunk = 256 * 1024;
const rawFormats: Record<string, { format: string; bytesPerSample: number }> = {
  pcm_s16le: { format: 's16le', bytesPerSample: 2 },
  pcm_s24le: { format: 's24le', bytesPerSample: 3 },
  pcm_s32le: { format: 's32le', bytesPerSample: 4 },
};

interface Growing {
  layout: WavLayout;
  part: string;
  target: string;
  /** The bytes of samples that ffmpeg has written, after the header */
  written: number;
  /** How many bytes of samples are decoded beyond the furthest one that a read asked for; infinite for a slow source, which is decoded to the end */
  ahead: number;
  /** The furthest byte of samples that a read asked for */
  demand: number;
  state: 'running' | 'done' | 'failed';
  events: EventEmitter;
}

export interface GrowingTrack {
  size: number;
  /** The bytes from `start` to `end` of the file, each as soon as ffmpeg has written it; ends early when the decode fails or the signal aborts */
  read: (start: number, end: number, signal: AbortSignal) => AsyncGenerator<Buffer>;
}

const growings = new Map<string, Growing>();
const wholeOnly = new Set<string>();

const waitForProgress = (growing: Growing, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const proceed = () => {
      growing.events.off('progress', proceed);
      signal.removeEventListener('abort', proceed);
      resolve();
    };
    growing.events.once('progress', proceed);
    signal.addEventListener('abort', proceed, { once: true });
  });

const openCopy = (growing: Growing) => open(growing.part, 'r').catch(() => open(growing.target, 'r'));

const waitForBytes = async (growing: Growing, position: number, signal: AbortSignal) => {
  // a request for bytes that ffmpeg has not written yet waits for it
  while (growing.state === 'running' && wavHeaderSize + growing.written <= position && !signal.aborted) await waitForProgress(growing, signal);
  return wavHeaderSize + growing.written;
};

const readNext = async (growing: Growing, handle: FileHandle, position: number, end: number, signal: AbortSignal) => {
  if (position - wavHeaderSize > growing.demand) {
    growing.demand = position - wavHeaderSize;
    growing.events.emit('demand');
  }
  const written = await waitForBytes(growing, position, signal);
  const available = Math.min(end + 1, written) - position;
  if (available <= 0 || signal.aborted) return undefined;
  const buffer = Buffer.alloc(Math.min(available, readChunk));
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
  return bytesRead > 0 ? buffer.subarray(0, bytesRead) : undefined;
};

async function* readFrom(growing: Growing, handle: FileHandle, start: number, end: number, signal: AbortSignal) {
  let position = start;
  let chunk = await readNext(growing, handle, position, end, signal);
  while (chunk && position <= end) {
    position += chunk.length;
    yield chunk;
    chunk = position <= end ? await readNext(growing, handle, position, end, signal) : undefined;
  }
}

/** The file is created when the decode gets its slot, so a read that comes sooner waits for it */
const openWhenWritten = async (growing: Growing, signal: AbortSignal) => {
  let handle = await openCopy(growing).catch(() => undefined);
  while (!handle && growing.state === 'running' && !signal.aborted) {
    await waitForProgress(growing, signal);
    handle = await openCopy(growing).catch(() => undefined);
  }
  return handle;
};

async function* readGrowing(growing: Growing, start: number, end: number, signal: AbortSignal) {
  const handle: FileHandle | undefined = await openWhenWritten(growing, signal);
  if (!handle) return;
  try {
    yield* readFrom(growing, handle, start, end, signal);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** Waits until a read gets near the decoded bytes; false when none came for `idleStopMs`. The slot is free meanwhile. */
const waitForDemand = async (growing: Growing) => {
  freeSlot();
  const asked = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), idleStopMs);
    growing.events.once('demand', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  await takeSlot();
  return asked;
};

/** Holds the decode back while it is a window ahead of every read; throws when no read comes for too long */
const holdBack = async (growing: Growing) => {
  const asked = growing.written > growing.demand + growing.ahead ? await waitForDemand(growing) : true;
  if (!asked) throw new Error('no reader came for the decoded track');
  if (growing.written > growing.demand + growing.ahead) await holdBack(growing);
};

const copyOutput = async (growing: Growing, handle: FileHandle, output: AsyncIterable<Buffer>) => {
  for await (const chunk of output) {
    await holdBack(growing);
    await handle.write(chunk, 0, chunk.length, wavHeaderSize + growing.written);
    growing.written += chunk.length;
    growing.events.emit('progress');
  }
};

const pump = async (growing: Growing, handle: FileHandle, source: string, encoder: string[]) => {
  const raw = rawFormats[encoder[encoder.length - 1]];
  const child = spawn(
    ffmpegProgram(),
    ['-nostdin', '-v', 'error', '-fflags', '+bitexact', '-i', source, '-map', '0:a:0', '-map_metadata', '-1', ...encoder, '-f', raw.format, 'pipe:1'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  );
  const errors: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
  const closed = new Promise<number | null>((resolve) => {
    child.on('error', (error) => {
      logError(error);
      resolve(-1);
    });
    child.on('close', resolve);
  });
  await copyOutput(growing, handle, child.stdout).catch((error) => {
    logError(error);
    child.kill();
  });
  const code = await closed;
  if (code !== 0) logError(new Error(`ffmpeg failed on ${source}: ${Buffer.concat(errors).toString().trim()}`));
  return code === 0;
};

const writeGrowing = async (key: string, growing: Growing, source: string, encoder: string[]) => {
  await mkdir(dirname(growing.part), { recursive: true });
  const handle = await open(growing.part, 'w');
  const expected = wavSize(growing.layout) - wavHeaderSize;
  const ended = await handle
    .write(wavHeader(growing.layout), 0, wavHeaderSize, 0)
    .then(() => void growing.events.emit('progress'))
    .then(() => pump(growing, handle, source, encoder))
    .finally(() => handle.close());
  const whole = ended && growing.written === expected;
  if (ended && !whole) {
    logError(new Error(`ffmpeg wrote ${growing.written} bytes of ${source}, the file said ${expected}`));
    wholeOnly.add(key);
  }
  if (!whole) await rm(growing.part, { force: true });
  else await rename(growing.part, growing.target);
  growing.state = whole ? 'done' : 'failed';
  growing.events.emit('progress');
  if (whole) await evict().catch(logError);
  return whole ? growing.target : undefined;
};

const startGrowing = (key: string, source: string, encoder: string[], target: string, layout: WavLayout, speed: SourceSpeed) => {
  const bytesPerSecond = layout.sampleRate * layout.channels * layout.bytesPerSample;
  const growing: Growing = {
    layout,
    part: `${target}.part`,
    target,
    written: 0,
    ahead: aheadBytes(speed, bytesPerSecond),
    demand: 0,
    state: 'running',
    events: new EventEmitter(),
  };
  growing.events.setMaxListeners(0);
  const job = { done: Promise.resolve<string | undefined>(undefined), waiters: 0, cancelled: false, growing: true };
  job.done = takeSlot()
    .then(() => writeGrowing(key, growing, source, encoder).finally(freeSlot))
    .catch((error) => {
      logError(error);
      growing.state = 'failed';
      growing.events.emit('progress');
      return undefined;
    })
    .finally(() => {
      jobs.delete(key);
      growings.delete(key);
    });
  jobs.set(key, job);
  growings.set(key, growing);
  return growing;
};

const toGrowingTrack = (growing: Growing): GrowingTrack => ({
  size: wavSize(growing.layout),
  read: (start, end, signal) => readGrowing(growing, start, end, signal),
});

const toLayout = (encoder: string[], length: { channels: number; sampleRate: number; frames: number }): WavLayout | undefined => {
  const raw = rawFormats[encoder[encoder.length - 1]];
  return raw && length.channels <= 2 ? { ...length, bytesPerSample: raw.bytesPerSample } : undefined;
};

/**
 * The track to serve while it is decoded: the cached file when there is one, a growing one for a codec with an exact length, and undefined when the
 * whole decode has to run first (`playableFile`). See docs/app/decoder-proxy.md
 */
export const growingTrack = async ({ path, ...format }: PlayableTrack, signal: AbortSignal): Promise<GrowingTrack | string | undefined> => {
  if (!isProgressiveCodec(format.codec) || signal.aborted) return undefined;
  const prepared = await prepareDecode(path, format satisfies Format);
  if (!prepared) return undefined;

  const { key, encoder, speed, target } = prepared;
  const cached = await cachedCopy(target);
  const running = growings.get(key);
  if (cached) return cached;
  if (running) return toGrowingTrack(running);
  if (wholeOnly.has(key) || jobs.has(key)) return undefined;

  const length = await probeAudio(path);
  const layout = length && toLayout(encoder, length);
  if (!layout) return undefined;
  // another request may have started it meanwhile
  const started = growings.get(key) ?? (jobs.has(key) ? undefined : startGrowing(key, path, encoder, target, layout, speed));
  return started && toGrowingTrack(started);
};
