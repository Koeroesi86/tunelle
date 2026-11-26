import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { memoryFs } from '../test-memory-fs';
import { behindBytes, idleStopMs, maxWindows, restAfterMs, windowMemoryLimit, windowReach, type SourceSpeed } from './decode-policy';
import { probeAudio } from './probe-audio';
import { serveWindowed } from './serve-windowed';
import { sourceSpeed } from './source-speed';
import { wavHeader, type WavLayout } from './wav-header';

const temp = path.join(path.sep, 'temp');
const cache = path.join(temp, 'tunelle-whole-decodes');

const { spawnFake } = vi.hoisted(() => ({ spawnFake: vi.fn() }));

vi.mock('fs/promises', async () => ({ ...memoryFs.promises }));
vi.mock('child_process', () => ({ spawn: spawnFake }));
vi.mock('electron', () => ({ app: { getPath: () => temp, getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));
vi.mock('./probe-audio', () => ({ probeAudio: vi.fn() }));
vi.mock('./source-speed', () => ({ sourceSpeed: vi.fn() }));

// 2000 bytes per second: a window of a fast source reaches 10000 bytes ahead, of a slow one 20000, and the track is 200000 bytes of samples
const layout: WavLayout = { channels: 1, sampleRate: 1000, bytesPerSample: 2, frames: 100_000 };
const wavHeaderSize = 44;
const samples = 200_000;
const size = wavHeaderSize + samples;
const { ahead } = windowReach('fast', 2000);

/** The samples of every fake decode: the byte at `offset` is `offset % 251`, so a decode from the wrong place shows */
const pattern = (offset: number, length: number) => Buffer.alloc(length, Buffer.from(Array.from({ length: 251 }, (_, index) => (offset + index) % 251)));

interface FakeDecode {
  /** The first byte of samples that was asked for with `-ss` */
  from: number;
  /** The bytes that the app has taken */
  taken: number;
  seek: string | undefined;
  kill: ReturnType<typeof vi.fn>;
}

const decodes: FakeDecode[] = [];
const ffmpeg = { chunk: 1000, length: samples, rate: 1000, frameSize: 2, code: 0, stalled: false };

/** An ffmpeg that gives the samples from its `-ss` on, only as fast as they are taken */
const fakeSpawn = (_program: string, args: string[]) => {
  const seek = args.includes('-ss') ? args[args.indexOf('-ss') + 1] : undefined;
  const child = new EventEmitter();
  const decode: FakeDecode = {
    from: Math.round(Number(seek ?? 0) * ffmpeg.rate) * ffmpeg.frameSize,
    taken: 0,
    seek,
    kill: vi.fn(() => queueMicrotask(() => child.emit('close', null))),
  };
  decodes.push(decode);
  const { chunk, length, code, stalled } = ffmpeg;
  async function* output() {
    if (stalled) await new Promise<void>((resolve) => child.once('close', () => resolve()));
    while (decode.from + decode.taken < length && decode.kill.mock.calls.length === 0) {
      const next = pattern(decode.from + decode.taken, Math.min(chunk, length - decode.from - decode.taken));
      decode.taken += next.length;
      yield next;
    }
    queueMicrotask(() => child.emit('close', code));
  }
  return Object.assign(child, { stdout: output(), stderr: new EventEmitter(), kill: decode.kill });
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

let windowedTrack: typeof import('./windowed-track').windowedTrack;
let counter = 0;

const open = async (speed: SourceSpeed = 'fast', codec = 'FLAC', bitDepth: number | null = null) => {
  const source = path.join(path.sep, 'music', `track-${counter++}.flac`);
  memoryFs.sync.mkdirSync(path.dirname(source));
  memoryFs.sync.writeFileSync(source, 'flac');
  vi.mocked(sourceSpeed).mockResolvedValue(speed);
  const format = { path: source, codec, bitDepth };
  const again = () => windowedTrack(format, new AbortController().signal);
  return { track: await again(), again };
};

const openTrack = async (speed: SourceSpeed = 'fast', bitDepth: number | null = null) => {
  const { track, again } = await open(speed, 'FLAC', bitDepth);
  if (!track) throw new Error('expected a windowed track');
  return { track, again };
};

/** A request for the file from `start` on, read one piece at a time */
const request = async (start: number, signal = new AbortController().signal) => {
  const { track } = await openTrack();
  return track.read(start, track.size - 1, signal);
};

const next = async (reader: AsyncGenerator<Buffer>) => {
  const { value } = await reader.next();
  await settle();
  return value as Buffer | undefined;
};

const readAll = async (reader: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of reader) chunks.push(chunk);
  return Buffer.concat(chunks);
};

/** The bytes of the file from `start` on, as a reader should get them */
const fileFrom = (start: number, end = size) =>
  Buffer.concat([wavHeader(layout).subarray(start), pattern(Math.max(start - wavHeaderSize, 0), end - Math.max(start, wavHeaderSize))]);

describe('windowedTrack', () => {
  beforeEach(async () => {
    memoryFs.reset();
    decodes.length = 0;
    Object.assign(ffmpeg, { chunk: 1000, length: samples, rate: 1000, frameSize: 2, code: 0, stalled: false });
    vi.mocked(probeAudio).mockResolvedValue(layout);
    spawnFake.mockImplementation(fakeSpawn);
    vi.resetModules();
    ({ windowedTrack } = await import('./windowed-track'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('leaves a codec without an exact length to the whole decode', async () => {
    expect((await open('fast', 'WMA')).track).toBeUndefined();
  });

  it('leaves a track of more than two channels to the whole decode', async () => {
    vi.mocked(probeAudio).mockResolvedValue({ ...layout, channels: 6 });

    expect((await open()).track).toBeUndefined();
  });

  it('answers a range of the header without a decode', async () => {
    const { track } = await openTrack();

    expect(await readAll(track.read(0, wavHeaderSize - 1, new AbortController().signal))).toEqual(wavHeader(layout));
    expect(decodes).toHaveLength(0);
  });

  it('serves the whole file from one decode and writes nothing to the cache', async () => {
    const { track } = await openTrack();

    expect(track.size).toBe(size);
    expect((await readAll(track.read(0, size - 1, new AbortController().signal))).equals(fileFrom(0))).toBe(true);
    expect(decodes).toHaveLength(1);
    expect(memoryFs.sync.existsSync(cache)).toBe(false);
  });

  it.each(['fast' as const, 'slow' as const])('decodes a window of a %s source ahead of the read, and waits there', async (speed) => {
    const { track } = await openTrack(speed);
    await next(track.read(wavHeaderSize, size - 1, new AbortController().signal));

    expect(decodes[0].taken).toBe(1000 + windowReach(speed, 2000).ahead);
  });

  it('starts a decode at the frame of a read that is outside the window', async () => {
    const { track } = await openTrack();
    await next(track.read(wavHeaderSize, size - 1, new AbortController().signal));
    const seek = track.read(wavHeaderSize + 150_001, size - 1, new AbortController().signal);

    expect((await readAll(seek)).equals(fileFrom(wavHeaderSize + 150_001))).toBe(true);
    expect(decodes.map(({ seek, from }) => [seek, from])).toEqual([
      [undefined, 0],
      ['75.000000000', 150_000],
    ]);
  });

  it('answers a request that overlaps an open one from the window', async () => {
    const { track } = await openTrack();
    const first = track.read(wavHeaderSize, size - 1, new AbortController().signal);
    await next(first);
    await next(first);

    const again = track.read(wavHeaderSize + 500, wavHeaderSize + 3499, new AbortController().signal);

    expect(await readAll(again)).toEqual(fileFrom(wavHeaderSize + 500, wavHeaderSize + 3500));
    expect(decodes).toHaveLength(1);
  });

  it('answers a request that goes back by what Chromium had not received from the window, and one that goes further with a new decode', async () => {
    const long: WavLayout = { ...layout, frames: 4 * 1024 ** 2 };
    const chunk = 64 * 1024;
    vi.mocked(probeAudio).mockResolvedValue(long);
    Object.assign(ffmpeg, { chunk, length: long.frames * ffmpeg.frameSize });
    const { track } = await openTrack();
    const signal = new AbortController().signal;
    const stop = wavHeaderSize + behindBytes + 4 * chunk;
    await readAll(track.read(wavHeaderSize, stop - 1, signal));

    const again = await readAll(track.read(stop - behindBytes, stop - 1, signal));
    expect(again.equals(pattern(4 * chunk, behindBytes))).toBe(true);
    expect(decodes).toHaveLength(1);

    await readAll(track.read(wavHeaderSize, wavHeaderSize + 999, signal));
    expect(decodes).toHaveLength(2);
  });

  it('stops ffmpeg of a paused reader, keeps its window and decodes on from where the window ends', async () => {
    // a chunk of an odd size, so the window ends inside a frame
    ffmpeg.chunk = 1001;
    const reader = await request(wavHeaderSize);
    const first = await next(reader);

    await vi.advanceTimersByTimeAsync(restAfterMs);
    expect(decodes[0].kill).toHaveBeenCalled();
    const held = decodes[0].taken;

    await vi.advanceTimersByTimeAsync(idleStopMs + 1000);
    const buffered = await next(reader);
    expect(decodes).toHaveLength(1);

    expect(Buffer.concat([first as Buffer, buffered as Buffer, await readAll(reader)]).equals(fileFrom(wavHeaderSize))).toBe(true);
    expect(held % 2).toBe(1);
    expect(decodes.map(({ from }) => from)).toEqual([0, held - 1]);
  });

  it('stops ffmpeg of a window without a reader, and answers a re-read from it without a decode', async () => {
    const { track } = await openTrack();
    const signal = new AbortController().signal;
    await readAll(track.read(wavHeaderSize, wavHeaderSize + 999, signal));
    await settle();

    await vi.advanceTimersByTimeAsync(restAfterMs);
    expect(decodes[0].kill).toHaveBeenCalled();

    expect(await readAll(track.read(wavHeaderSize, wavHeaderSize + 999, signal))).toEqual(fileFrom(wavHeaderSize, wavHeaderSize + 1000));
    expect(decodes).toHaveLength(1);
  });

  it('keeps ffmpeg while the reads move the window more often than the rest time', async () => {
    const reader = await request(wavHeaderSize);

    for (let read = 0; read < 5; read++) {
      await next(reader);
      await vi.advanceTimersByTimeAsync(restAfterMs - 1);
    }

    expect(decodes[0].kill).not.toHaveBeenCalled();
    expect(decodes).toHaveLength(1);
  });

  it('lets ffmpeg end by itself when the full window holds the end of its track', async () => {
    const total = ahead + 1000;
    vi.mocked(probeAudio).mockResolvedValue({ ...layout, frames: total / 2 });
    ffmpeg.length = total;
    const { track } = await openTrack();
    await readAll(track.read(wavHeaderSize, wavHeaderSize + 999, new AbortController().signal));
    await settle();

    await vi.advanceTimersByTimeAsync(restAfterMs);

    expect(decodes[0].taken).toBe(total);
    expect(decodes[0].kill).not.toHaveBeenCalled();
  });

  it('drops a window that nothing reads for the idle time, and decodes again for the next read', async () => {
    const { track } = await openTrack();
    const signal = new AbortController().signal;
    await readAll(track.read(wavHeaderSize, wavHeaderSize + 999, signal));

    await vi.advanceTimersByTimeAsync(idleStopMs + 1000);

    await readAll(track.read(wavHeaderSize + 1000, wavHeaderSize + 1999, signal));
    expect(decodes).toHaveLength(2);
  });

  it('gives a reader that runs ahead of a paused one its own decode, so the paused one keeps its window', async () => {
    const { track } = await openTrack();
    const paused = track.read(wavHeaderSize, size - 1, new AbortController().signal);
    await next(paused);

    const measured = await readAll(track.read(wavHeaderSize, size - 1, new AbortController().signal));
    const resumed = await next(paused);

    expect(measured.equals(fileFrom(wavHeaderSize))).toBe(true);
    expect(resumed).toEqual(pattern(1000, 1000));
    expect(decodes.map(({ from }) => from)).toEqual([0, 1000 + ahead]);
    expect(decodes[0].kill).not.toHaveBeenCalled();
  });

  it('keeps no more than the most windows, and drops one that nothing reads first', async () => {
    const open = Array.from({ length: maxWindows - 1 }, () => request(wavHeaderSize));
    for (const reader of open) await next(await reader);
    const left = await request(wavHeaderSize);
    await next(left);
    await left.return(undefined);

    await next(await request(wavHeaderSize));

    expect(decodes.map(({ kill }) => kill.mock.calls.length)).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it('goes on with a new decode when the window of an open reader was dropped for room', async () => {
    const readers = await Promise.all(Array.from({ length: maxWindows }, () => request(wavHeaderSize)));
    for (const reader of readers) await next(reader);

    await next(await request(wavHeaderSize));
    expect(decodes[0].kill).toHaveBeenCalled();

    expect(await next(readers[0])).toEqual(pattern(1000, 1000));
    expect(decodes).toHaveLength(maxWindows + 2);
    expect(decodes[maxWindows + 1].from).toBe(1000);
  });

  it('holds the windows of the largest rate under the memory limit', async () => {
    const large: WavLayout = { channels: 2, sampleRate: 768_000, bytesPerSample: 4, frames: 76_800_000 };
    const frameSize = 8;
    const chunk = 1024 ** 2;
    vi.mocked(probeAudio).mockResolvedValue(large);
    Object.assign(ffmpeg, { chunk, length: frameSize * large.frames, rate: large.sampleRate, frameSize });

    for (let index = 0; index <= maxWindows; index++) {
      const { track } = await openTrack('slow', 32);
      await next(track.read(wavHeaderSize, track.size - 1, new AbortController().signal));
    }

    const live = decodes.filter(({ kill }) => kill.mock.calls.length === 0);
    expect(live).toHaveLength(maxWindows);
    // a chunk read, then ahead of it, and what is kept behind; a chunk of ffmpeg may reach over the end of each window
    expect(live.reduce((sum, { taken }) => sum + taken - chunk + behindBytes, 0)).toBeLessThanOrEqual(windowMemoryLimit + maxWindows * chunk);
  });

  it('ends a read that waits when its request is aborted', async () => {
    ffmpeg.stalled = true;
    const aborted = new AbortController();
    const reader = await request(wavHeaderSize, aborted.signal);
    const waiting = reader.next();
    await settle();

    aborted.abort();

    await expect(waiting).resolves.toEqual({ done: true, value: undefined });
  });

  it.each([
    ['fewer', samples - 100],
    ['more', samples + 100],
  ])('leaves a track with %s bytes than its file said to the whole decode', async (_, length) => {
    ffmpeg.length = length;
    const { track, again } = await openTrack();

    const bytes = await readAll(track.read(0, size - 1, new AbortController().signal));

    expect(bytes.equals(fileFrom(0, wavHeaderSize + Math.min(length, samples)))).toBe(true);
    expect(await again()).toBeUndefined();
  });

  it('fails the body of an answer when ffmpeg fails midway', async () => {
    Object.assign(ffmpeg, { length: 3000, code: 1 });
    const { track } = await openTrack();

    const response = serveWindowed(track, new Request('tunelle://app/track'));

    await expect(response.arrayBuffer()).rejects.toThrow('The decode ended before the end of the range');
  });

  it('ends the read when ffmpeg fails, without starting it again and again, and tries again for a later request', async () => {
    Object.assign(ffmpeg, { length: 3000, code: 1 });
    const { track, again } = await openTrack();

    const bytes = await readAll(track.read(wavHeaderSize, size - 1, new AbortController().signal));

    expect(bytes).toEqual(pattern(0, 3000));
    expect(decodes).toHaveLength(1);
    expect(await again()).toBeDefined();
  });
});
