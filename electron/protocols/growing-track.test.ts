import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { Readable } from 'stream';
import { memoryFs } from '../test-memory-fs';
import { idleStopMs } from './decode-policy';
import { probeAudio } from './probe-audio';
import { sourceSpeed } from './source-speed';

const temp = path.join(path.sep, 'temp');
const cache = path.join(temp, 'tunelle-decoded');

const { spawnFake } = vi.hoisted(() => ({ spawnFake: vi.fn() }));

vi.mock('fs/promises', async () => ({ ...memoryFs.promises }));
vi.mock('child_process', () => ({ spawn: spawnFake }));
vi.mock('electron', () => ({ app: { getPath: () => temp, getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));
vi.mock('./probe-audio', () => ({ probeAudio: vi.fn() }));
vi.mock('./source-speed', () => ({ sourceSpeed: vi.fn() }));

let growingTrack: typeof import('./growing-track').growingTrack;

// 2000 bytes per second, so a fast source is decoded 120000 bytes ahead of the furthest read, and the track is 200000 bytes long
const layout = { channels: 1, sampleRate: 1000, frames: 100_000 };
const chunk = 50_000;
const chunks = 4;

/** An ffmpeg that writes what the test pushes, and ends when it is told to or killed */
const fakeFfmpeg = () => {
  const stdout = new Readable({ objectMode: true, read: () => undefined });
  const child = Object.assign(new EventEmitter(), { stdout, stderr: new EventEmitter(), kill: vi.fn(() => void child.emit('close', null)) });
  spawnFake.mockReturnValue(child);
  return {
    child,
    write: (count: number) => Array.from({ length: count }).forEach(() => stdout.push(Buffer.alloc(chunk))),
    end: () => {
      stdout.push(null);
      child.emit('close', 0);
    },
  };
};

const names = (extension: string) => (memoryFs.sync.existsSync(cache) ? memoryFs.sync.readdirSync(cache).filter((name) => name.endsWith(extension)) : []);
const partSize = () => names('.part').map((name) => memoryFs.sync.statSync(path.join(cache, name)).size)[0];
const wholeFiles = () => names('.wav');
const partFiles = () => names('.part');

let counter = 0;
const start = async (speed: 'fast' | 'slow') => {
  const source = path.join(path.sep, 'music', `track-${counter++}.flac`);
  memoryFs.sync.mkdirSync(path.dirname(source));
  memoryFs.sync.writeFileSync(source, 'flac');
  vi.mocked(sourceSpeed).mockResolvedValue(speed);
  vi.mocked(probeAudio).mockResolvedValue(layout);
  const ffmpeg = fakeFfmpeg();
  const track = await growingTrack({ path: source, codec: 'FLAC', bitDepth: null }, new AbortController().signal);
  if (!track || typeof track === 'string') throw new Error('expected a growing track');
  await vi.waitFor(() => expect(spawnFake).toHaveBeenCalled());
  return { ffmpeg, track };
};

describe('growingTrack window', () => {
  beforeEach(async () => {
    memoryFs.reset();
    vi.resetModules();
    ({ growingTrack } = await import('./growing-track'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('decodes a slow source to the end although nothing reads it', async () => {
    const { ffmpeg } = await start('slow');
    ffmpeg.write(chunks);
    ffmpeg.end();
    await vi.waitFor(() => expect(wholeFiles()).toHaveLength(1));
  });

  it('holds a fast source back a window ahead of the reads', async () => {
    const { ffmpeg } = await start('fast');
    ffmpeg.write(chunks);
    await vi.waitFor(() => expect(partSize()).toBe(44 + 3 * chunk));
    await vi.advanceTimersByTimeAsync(1000);
    expect(partSize()).toBe(44 + 3 * chunk);
    expect(ffmpeg.child.kill).not.toHaveBeenCalled();
  });

  it('keeps a held decode for a reader that is paused longer than the idle time, and serves the whole track when it goes on', async () => {
    const { ffmpeg, track } = await start('fast');
    const stream = track.read(0, track.size - 1, new AbortController().signal);
    const received: Buffer[] = [];
    received.push((await stream.next()).value as Buffer);
    ffmpeg.write(chunks);
    await vi.waitFor(() => expect(partSize()).toBe(44 + 3 * chunk));

    await vi.advanceTimersByTimeAsync(idleStopMs + 1000);
    expect(ffmpeg.child.kill).not.toHaveBeenCalled();

    ffmpeg.end();
    for await (const part of stream) received.push(part);
    expect(Buffer.concat(received).length).toBe(track.size);
  });

  it('stops a held decode and removes its file when no reader is left for the idle time', async () => {
    const { ffmpeg, track } = await start('fast');
    const stream = track.read(0, track.size - 1, new AbortController().signal);
    await stream.next();
    ffmpeg.write(chunks);
    await vi.waitFor(() => expect(partSize()).toBe(44 + 3 * chunk));
    await stream.return(undefined);

    await vi.advanceTimersByTimeAsync(idleStopMs + 1000);
    await vi.waitFor(() => expect(partFiles()).toHaveLength(0));
    expect(ffmpeg.child.kill).toHaveBeenCalled();
    expect(wholeFiles()).toHaveLength(0);
  });
});
