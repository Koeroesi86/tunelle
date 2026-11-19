import { EventEmitter } from 'events';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'child_process';
import { memoryFs } from '../test-memory-fs';
import { decodeTrack, playableFile } from './decoded-track';
import { logError } from '../utils/log-error';

const sizes = vi.hoisted(() => new Map<string, number>());

vi.mock('fs/promises', async () => ({
  ...memoryFs.promises,
  stat: async (file: string) => {
    const stats = await memoryFs.promises.stat(file);
    return { ...stats, size: sizes.get(path.basename(file)) ?? stats.size };
  },
}));
vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/temp', getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const cache = path.resolve('/temp', 'tunelle-decoded');

type Behaviour = { code: number; error?: Error; hold?: boolean };

/** A decoder that writes its output file and closes, or fails, or waits until it is killed */
const decoder = ({ code, error, hold }: Behaviour) => {
  const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn(() => void child.emit('close', null)) });
  vi.mocked(spawn).mockImplementationOnce(((_program: string, args: string[]) => {
    setImmediate(() => {
      if (error) return child.emit('error', error);
      if (hold) return undefined;
      if (code === 0) memoryFs.sync.writeFileSync(args[args.indexOf('-y') + 1], 'wav');
      else child.stderr.emit('data', Buffer.from('broken\n'));
      return child.emit('close', code);
    });
    return child;
  }) as unknown as typeof spawn);
  return child;
};

describe('decodeTrack', () => {
  const signal = () => new AbortController().signal;
  const format = { codec: 'DSD', bitDepth: 1 };
  let source = '';
  let count = 0;

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/music');
    count += 1;
    source = `/music/track-${count}.dsf`;
    memoryFs.sync.writeFileSync(source, 'dsd');
    sizes.clear();
    vi.mocked(spawn).mockReset();
  });

  it('writes the track as a wav into the cache and gives its path', async () => {
    decoder({ code: 0 });

    const file = await decodeTrack(source, format, signal());

    expect(path.dirname(file ?? '')).toBe(cache);
    expect(memoryFs.sync.readdirSync(cache)).toEqual([path.basename(file ?? '')]);
    expect(memoryFs.sync.readFileSync(file ?? '', 'utf8')).toBe('wav');
  });

  it('runs the ffmpeg of the development folder, one audio stream, no metadata', async () => {
    decoder({ code: 0 });

    await decodeTrack(source, format, signal());

    const [program, args] = vi.mocked(spawn).mock.calls[0] as unknown as [string, string[]];
    expect(program).toBe(path.join('/app', '.cache', 'ffmpeg', 'install', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
    expect(args).toEqual(expect.arrayContaining(['-i', source, '-map', '0:a:0', '-map_metadata', '-1', '-f', 'wav']));
  });

  it.each([
    [{ codec: 'DSD', bitDepth: 1 }, ['-ar', '88200', '-c:a', 'pcm_s24le']],
    [{ codec: 'ALAC', bitDepth: null }, ['-c:a', 'pcm_s16le']],
    [{ codec: 'ALAC', bitDepth: 16 }, ['-c:a', 'pcm_s16le']],
    [{ codec: 'ALAC', bitDepth: 24 }, ['-c:a', 'pcm_s24le']],
    [{ codec: 'AIFF', bitDepth: 32 }, ['-c:a', 'pcm_s32le']],
  ])('keeps the depth of %j in the wav', async (given, encoder) => {
    decoder({ code: 0 });

    await decodeTrack(source, given, signal());

    const [, args] = vi.mocked(spawn).mock.calls[0] as unknown as [string, string[]];
    expect(args.join(' ')).toContain(encoder.join(' '));
  });

  it('answers a second request for the same file from the cache, without decoding again', async () => {
    decoder({ code: 0 });
    const first = await decodeTrack(source, format, signal());

    const second = await decodeTrack(source, format, signal());

    expect(second).toBe(first);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('decodes once for the requests that ask while the decode runs', async () => {
    decoder({ code: 0 });

    const [one, two] = await Promise.all([decodeTrack(source, format, signal()), decodeTrack(source, format, signal())]);

    expect(one).toBeDefined();
    expect(two).toBe(one);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('decodes again when the file changed', async () => {
    decoder({ code: 0 });
    const first = await decodeTrack(source, format, signal());
    memoryFs.sync.writeFileSync(source, 'dsd changed');
    decoder({ code: 0 });

    const second = await decodeTrack(source, format, signal());

    expect(second).not.toBe(first);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('gives nothing for a file that is not there, a folder, or a request that is gone', async () => {
    const gone = new AbortController();
    gone.abort();

    expect(await decodeTrack('/music/missing.dsf', format, signal())).toBeUndefined();
    expect(await decodeTrack('/music', format, signal())).toBeUndefined();
    expect(await decodeTrack(source, format, gone.signal)).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('logs what ffmpeg said, leaves no partial file and gives nothing when the decode fails', async () => {
    decoder({ code: 1 });

    const file = await decodeTrack(source, format, signal());

    expect(file).toBeUndefined();
    expect(memoryFs.sync.readdirSync(cache)).toEqual([]);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: `ffmpeg failed on ${source}: broken` }));
  });

  it('logs and gives nothing when ffmpeg can not start', async () => {
    const error = new Error('spawn ffmpeg ENOENT');
    decoder({ code: 0, error });

    expect(await decodeTrack(source, format, signal())).toBeUndefined();
    expect(logError).toHaveBeenCalledWith(error);
  });

  it('stops the decode when the only request that waits for it is gone, without logging a failure', async () => {
    const controller = new AbortController();
    const child = decoder({ code: 0, hold: true });
    const pending = decodeTrack(source, format, controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());

    controller.abort();

    expect(await pending).toBeUndefined();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps the decode while another request still waits for it', async () => {
    const first = new AbortController();
    const child = decoder({ code: 0, hold: true });
    const one = decodeTrack(source, format, first.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const two = decodeTrack(source, format, signal());
    await new Promise((resolve) => setTimeout(resolve, 10));

    first.abort();

    expect(child.kill).not.toHaveBeenCalled();
    child.emit('close', null);
    await Promise.all([one, two]);
  });

  it('removes the oldest files when the cache is over its limit, and keeps the track it just made', async () => {
    const gib = 1024 ** 3;
    memoryFs.sync.mkdirSync(cache);
    ['old.wav', 'newer.wav'].forEach((name, index) => {
      memoryFs.sync.writeFileSync(path.join(cache, name), 'x');
      void memoryFs.promises.utimes(path.join(cache, name), new Date(), new Date(1000 + index));
      sizes.set(name, 1.5 * gib);
    });
    decoder({ code: 0 });

    const file = await decodeTrack(source, format, signal());

    expect(memoryFs.sync.readdirSync(cache).sort()).toEqual(['newer.wav', path.basename(file ?? '')].sort());
  });

  it('leaves the cache alone while it fits', async () => {
    memoryFs.sync.mkdirSync(cache);
    memoryFs.sync.writeFileSync(path.join(cache, 'old.wav'), 'x');
    decoder({ code: 0 });

    await decodeTrack(source, format, signal());

    expect(memoryFs.sync.readdirSync(cache)).toHaveLength(2);
  });
});

describe('playableFile', () => {
  beforeEach(() => {
    memoryFs.reset();
    vi.mocked(spawn).mockReset();
  });

  it('gives the file itself for a codec that Chromium plays', async () => {
    expect(await playableFile({ path: '/music/a.flac', codec: 'FLAC', bitDepth: 16 }, new AbortController().signal)).toBe('/music/a.flac');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('gives the decoded copy for a codec that it does not play', async () => {
    memoryFs.sync.mkdirSync('/music');
    memoryFs.sync.writeFileSync('/music/a.aiff', 'aiff');
    vi.mocked(spawn).mockImplementationOnce(((_program: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() });
      setImmediate(() => {
        memoryFs.sync.writeFileSync(args[args.indexOf('-y') + 1], 'wav');
        child.emit('close', 0);
      });
      return child;
    }) as unknown as typeof spawn);

    const file = await playableFile({ path: '/music/a.aiff', codec: 'AIFF', bitDepth: 16 }, new AbortController().signal);

    expect(file).toMatch(/\.wav$/);
  });
});
