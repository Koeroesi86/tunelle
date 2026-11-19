import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { temp, spawn } = vi.hoisted(() => ({ temp: { folder: '' }, spawn: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: () => temp.folder, getAppPath: () => path.join(temp.folder, 'out'), isPackaged: false } }));
vi.mock('child_process', () => ({ spawn }));
// the files of the cache count as big ones, so the limit is reached without writing gigabytes
vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>();
  return {
    ...original,
    stat: async (file: string) => {
      const stats = await original.stat(file);
      return Object.assign(Object.create(stats), { size: file.endsWith('.wav') ? 1.5 * 1024 ** 3 : stats.size });
    },
  };
});

const { decodeTrack, playableFile } = await import('./decoded-track');

interface FakeChild extends EventEmitter {
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  args: string[];
  finish: (code?: number, error?: string) => void;
}

describe('decoded track', () => {
  const children: FakeChild[] = [];
  const cached = () => fs.readdirSync(path.join(temp.folder, 'tunelle-decoded')).filter((name) => name.endsWith('.wav'));
  const source = (name: string, content = 'alac') => {
    const file = path.join(temp.folder, name);
    fs.writeFileSync(file, content);
    return file;
  };
  const never = new AbortController().signal;
  const alac = { codec: 'ALAC', bitDepth: 16 };

  beforeAll(() => {
    temp.folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-decoded-test-'));
  });

  beforeEach(() => {
    children.length = 0;
    fs.rmSync(path.join(temp.folder, 'tunelle-decoded'), { recursive: true, force: true });
    spawn.mockReset();
    // the fake decoder writes the output file (the last argument) when it is let to finish
    spawn.mockImplementation((_program: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
        kill: vi.fn(() => child.emit('close', null)),
        args,
        finish: (code = 0, error = '') => {
          if (code === 0) fs.writeFileSync(args[args.length - 1], 'RIFF');
          if (error) child.stderr.emit('data', Buffer.from(error));
          child.emit('close', code);
        },
      });
      children.push(child);
      return child;
    });
  });

  afterAll(() => fs.rmSync(temp.folder, { recursive: true, force: true }));

  const started = () => vi.waitFor(() => expect(children.length).toBeGreaterThan(0));

  it('decodes the first audio stream to a WAV of the depth of the file, written under another name', async () => {
    const file = source('a.m4a');
    const result = decodeTrack(file, { codec: 'ALAC', bitDepth: 24 }, never);
    await started();
    children[0].finish();

    const target = await result;
    expect(path.basename(target ?? '')).toMatch(/^[0-9a-f]{32}\.wav$/);
    expect(fs.readFileSync(target ?? '', 'utf8')).toBe('RIFF');
    expect(children[0].args).toEqual(expect.arrayContaining(['-i', file, '-map', '0:a:0', '-c:a', 'pcm_s24le', '-f', 'wav']));
    expect(children[0].args.at(-1)).toBe(`${target}.part`);
  });

  it.each([
    [null, 'pcm_s16le'],
    [16, 'pcm_s16le'],
    [32, 'pcm_s32le'],
  ])('encodes a depth of %s as %s', async (bitDepth, encoder) => {
    const result = decodeTrack(source(`depth-${bitDepth}.m4a`), { codec: 'ALAC', bitDepth }, never);
    await started();
    children[0].finish();
    await result;

    expect(children[0].args).toContain(encoder);
  });

  it.each([1, 8])('decodes DSD of %s bit to 88.2 kHz and 24 bit, whatever its rate', async (bitDepth) => {
    const result = decodeTrack(source(`dsd-${bitDepth}.dsf`), { codec: 'DSD', bitDepth }, never);
    await started();
    children[0].finish();
    await result;

    expect(children[0].args).toEqual(expect.arrayContaining(['-ar', '88200', '-c:a', 'pcm_s24le']));
    expect(children[0].args).not.toContain('pcm_s16le');
  });

  it('keeps the decoded copy of a DSD file apart from a PCM decode of the same file', async () => {
    const file = source('same.dsf');
    const dsd = decodeTrack(file, { codec: 'DSD', bitDepth: 1 }, never);
    const pcm = decodeTrack(file, { codec: 'ALAC', bitDepth: 16 }, never);
    await vi.waitFor(() => expect(children).toHaveLength(2));
    children.forEach((child) => child.finish());

    expect(await dsd).not.toBe(await pcm);
  });

  it('serves the second request from the cache without a decoder', async () => {
    const file = source('b.m4a');
    const first = decodeTrack(file, alac, never);
    await started();
    children[0].finish();

    expect(await decodeTrack(file, alac, never)).toBe(await first);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('decodes again when the file changed', async () => {
    const file = source('c.m4a');
    const first = decodeTrack(file, alac, never);
    await started();
    children[0].finish();
    await first;

    source('c.m4a', 'changed and longer');
    const second = decodeTrack(file, alac, never);
    await vi.waitFor(() => expect(children).toHaveLength(2));
    children[1].finish();

    expect(await second).not.toBe(await first);
  });

  it('shares one decoder between the requests for the same track', async () => {
    const file = source('d.m4a');
    const results = [decodeTrack(file, alac, never), decodeTrack(file, alac, never)];
    await started();
    children[0].finish();

    expect(new Set(await Promise.all(results)).size).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('kills the decoder when the only request is aborted, and not while another one waits', async () => {
    const [first, second] = [new AbortController(), new AbortController()];
    const file = source('e.m4a');
    const results = [decodeTrack(file, alac, first.signal), decodeTrack(file, alac, second.signal)];
    await started();

    first.abort();
    expect(children[0].kill).not.toHaveBeenCalled();
    second.abort();

    expect(children[0].kill).toHaveBeenCalledTimes(1);
    expect(await Promise.all(results)).toEqual([undefined, undefined]);
    expect(cached()).toEqual([]);
  });

  it('does not start for a request that is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await decodeTrack(source('f.m4a'), alac, controller.signal)).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('gives nothing, and leaves no file, when the decoder fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = decodeTrack(source('g.m4a'), alac, never);
    await started();
    children[0].finish(1, 'Invalid data');

    expect(await result).toBeUndefined();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid data') }));
    expect(fs.readdirSync(path.join(temp.folder, 'tunelle-decoded'))).toEqual([]);
    errors.mockRestore();
  });

  it('gives nothing when the decoder can not be started', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = decodeTrack(source('h.m4a'), alac, never);
    await started();
    children[0].emit('error', new Error('spawn ffmpeg ENOENT'));

    expect(await result).toBeUndefined();
    errors.mockRestore();
  });

  it('gives nothing for a file that is gone', async () => {
    expect(await decodeTrack(path.join(temp.folder, 'gone.m4a'), alac, never)).toBeUndefined();
  });

  it('runs two decoders at a time and starts the next when one ends', async () => {
    const results = ['i1', 'i2', 'i3'].map((name) => decodeTrack(source(`${name}.m4a`), alac, never));
    await vi.waitFor(() => expect(children).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(children).toHaveLength(2);
    children[0].finish();
    await vi.waitFor(() => expect(children).toHaveLength(3));
    children[1].finish();
    children[2].finish();
    expect((await Promise.all(results)).every(Boolean)).toBe(true);
  });

  it('removes the oldest decoded files over the limit, and keeps the ones served last', async () => {
    const names = ['j1', 'j2', 'j3', 'j4'];
    const targets: (string | undefined)[] = [];
    // a file older than the others: the modification time orders the files, the clock of a fast test would not
    for (const [index, name] of names.entries()) {
      const result = decodeTrack(source(`${name}.m4a`), alac, never);
      await vi.waitFor(() => expect(children).toHaveLength(index + 1));
      children[index].finish();
      targets.push(await result);
      fs.utimesSync(targets[index] ?? '', new Date(Date.now() - (names.length - index) * 1000), new Date(Date.now() - (names.length - index) * 1000));
    }

    expect(targets.map((target) => fs.existsSync(target ?? ''))).toEqual([false, true, true, true]);
  });

  it('serves a file that Chromium plays as it is, and decodes ALAC', async () => {
    const file = source('k.m4a');
    expect(await playableFile({ path: file, codec: 'FLAC', bitDepth: 16 }, never)).toBe(file);
    expect(spawn).not.toHaveBeenCalled();

    const result = playableFile({ path: file, codec: 'ALAC', bitDepth: 16 }, never);
    await started();
    children[0].finish();
    expect(await result).toMatch(/\.wav$/);
  });
});
