import { EventEmitter } from 'events';
import { PassThrough, Readable } from 'stream';
import { spawn } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeStream, peekStream, replay } from './stream-decode';
import { logError } from '../utils/log-error';

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/temp', getAppPath: () => '/app/dist', isPackaged: false } }));
vi.mock('../utils/log-error', () => ({ logError: vi.fn() }));

const wav = (sampleRate: number) => {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(sampleRate, 24);
  return header;
};

const fakeFfmpeg = () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValueOnce(child as never);
  return child;
};

const read = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

describe('peekStream', () => {
  it('reads until the format is known and leaves the bytes to the caller', async () => {
    const stream = new PassThrough();
    const peeking = peekStream(stream, (head) => (head.length >= 4 ? 'found' : undefined));
    stream.write('ab');
    stream.write('cd');

    expect((await peeking).toString()).toBe('abcd');
  });

  it('ends with what a short stream has', async () => {
    const stream = new PassThrough();
    const peeking = peekStream(stream, () => undefined);
    stream.end('sound');

    expect((await peeking).toString()).toBe('sound');
  });
});

describe('replay', () => {
  it('gives the head and then the rest, also of a stream that has ended', async () => {
    const rest = Readable.from([Buffer.from('def')]);
    await peekStream(rest, () => undefined);

    expect((await read(replay(Buffer.from('abc'), rest))).toString()).toBe('abc');
  });
});

describe('decodeStream', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(logError).mockReset();
  });

  it('feeds ffmpeg the head and the rest, and gives the WAV with its rate', async () => {
    const child = fakeFfmpeg();
    const rest = new PassThrough();
    const onSampleRate = vi.fn();
    const input: Buffer[] = [];
    child.stdin.on('data', (chunk: Buffer) => input.push(chunk));

    const decoding = decodeStream(Buffer.from('head'), rest, onSampleRate);
    child.stdout.write(wav(48000));
    const audio = await decoding;
    rest.end('rest');
    child.stdout.end(Buffer.from('pcm'));

    expect(onSampleRate).toHaveBeenCalledWith(48000);
    expect((await read(audio ?? Readable.from([]))).subarray(44).toString()).toBe('pcm');
    expect(Buffer.concat(input).toString()).toBe('headrest');
    expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(expect.arrayContaining(['-i', 'pipe:0', '-f', 'wav', 'pipe:1']));
  });

  it('kills ffmpeg and closes the stream when the WAV is closed', async () => {
    const child = fakeFfmpeg();
    const rest = new PassThrough();

    const decoding = decodeStream(Buffer.from('head'), rest, vi.fn());
    child.stdout.write(wav(44100));
    const audio = await decoding;
    audio?.destroy();
    await new Promise((resolve) => setImmediate(resolve));

    expect(child.kill).toHaveBeenCalled();
    expect(rest.destroyed).toBe(true);
  });

  it('gives undefined when ffmpeg cannot start, so the stream plays as it is', async () => {
    const child = fakeFfmpeg();
    const decoding = decodeStream(Buffer.from('head'), new PassThrough(), vi.fn());
    child.emit('error', new Error('spawn ENOENT'));

    expect(await decoding).toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('gives undefined when ffmpeg ends with no audio', async () => {
    const child = fakeFfmpeg();
    const decoding = decodeStream(Buffer.from('head'), new PassThrough(), vi.fn());
    child.stderr.write('Invalid data\n');
    child.emit('close', 1);

    expect(await decoding).toBeUndefined();
  });
});
