import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openRadioStream } from './radio-proxy';
import { decodeStream } from './stream-decode';

vi.mock('http', () => ({ default: { get: vi.fn() } }));
vi.mock('./stream-decode', async (importOriginal) => ({ ...(await importOriginal<typeof import('./stream-decode')>()), decodeStream: vi.fn() }));
vi.mock('https', () => ({ default: { get: vi.fn() } }));

/** A response that holds its body and ends, as the start of a stream is read before the audio goes on */
const respond = (status: number, headers: Record<string, string>, body: string | Buffer = '') => {
  const response = Object.assign(new PassThrough(), { statusCode: status, headers });
  response.end(body);
  return response;
};
const answerWith = (client: typeof http | typeof https, ...responses: ReturnType<typeof respond>[]) =>
  vi.mocked(client.get).mockImplementation(() => {
    const request = new EventEmitter();
    const response = responses.shift();
    queueMicrotask(() => request.emit('response', response));
    return request as never;
  });
const read = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};
const deps = () => ({ resolveStream: vi.fn().mockResolvedValue('http://station.example/live'), onTitle: vi.fn(), onSampleRate: vi.fn() });

/** A Layer III frame of 128 kbit/s at 44.1 kHz, twice, which names the stream MP3 */
const mp3 = Buffer.concat([0, 1].map(() => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(413)])));

describe('openRadioStream', () => {
  beforeEach(() => {
    vi.mocked(decodeStream).mockReset().mockResolvedValue(undefined);
    vi.mocked(http.get).mockReset();
    vi.mocked(https.get).mockReset();
  });

  it('passes the audio of a station on with its content type, asking for the metadata', async () => {
    answerWith(http, respond(200, { 'content-type': 'audio/aac' }, 'sound'));

    const { contentType, audio } = await openRadioStream('abc', new AbortController().signal, deps());

    expect(contentType).toBe('audio/aac');
    expect(await read(audio)).toBe('sound');
    expect(vi.mocked(http.get).mock.calls[0][1]).toMatchObject({ headers: { 'Icy-MetaData': '1', 'User-Agent': 'Tunelle' } });
  });

  it('cuts off a station that sends nothing, so the stream ends instead of hanging', async () => {
    const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    vi.mocked(http.get).mockImplementation(() => {
      queueMicrotask(() => request.emit('response', respond(200, {})));
      return request as never;
    });

    await openRadioStream('abc', new AbortController().signal, deps());
    request.emit('timeout');

    expect(vi.mocked(http.get).mock.calls[0][1]).toMatchObject({ timeout: 20_000 });
    expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: 'The stream sent nothing' }));
  });

  it('takes audio/mpeg for a station that does not say, and uses https for an https address', async () => {
    answerWith(https, respond(200, {}));
    const dependencies = { ...deps(), resolveStream: vi.fn().mockResolvedValue('https://station.example/live') };

    expect((await openRadioStream('abc', new AbortController().signal, dependencies)).contentType).toBe('audio/mpeg');
    expect(https.get).toHaveBeenCalled();
  });

  it('strips the metadata of a station and tells its titles', async () => {
    const title = Buffer.from("StreamTitle='Artist - Song';".padEnd(32, '\0'));
    const dependencies = deps();
    answerWith(http, respond(200, { 'icy-metaint': '4' }, Buffer.concat([Buffer.from('aaaa'), Buffer.from([2]), title, Buffer.from('bbbb')])));

    const { audio } = await openRadioStream('abc', new AbortController().signal, dependencies);

    expect(await read(audio)).toBe('aaaabbbb');
    expect(dependencies.onTitle).toHaveBeenCalledWith('abc', 'Artist - Song', undefined);
  });

  it.each(['1.5', '-1', '0', 'Infinity', 'x'])('takes a station that names %s bytes between its metadata for one without', async (metaint) => {
    const dependencies = deps();
    answerWith(http, respond(200, { 'icy-metaint': metaint }, Buffer.from('aaaabbbb')));

    const { audio } = await openRadioStream('abc', new AbortController().signal, dependencies);

    expect(await read(audio)).toBe('aaaabbbb');
    expect(dependencies.onTitle).not.toHaveBeenCalled();
  });

  it('follows a redirect, and gives up after too many', async () => {
    answerWith(http, respond(302, { location: '/other' }), respond(200, { 'content-type': 'audio/ogg' }));
    expect((await openRadioStream('abc', new AbortController().signal, deps())).contentType).toBe('audio/ogg');
    expect(vi.mocked(http.get).mock.calls[1][0]).toEqual(new URL('http://station.example/other'));

    vi.mocked(http.get).mockReset();
    answerWith(http, ...Array.from({ length: 7 }, () => respond(301, { location: '/again' })));
    await expect(openRadioStream('abc', new AbortController().signal, deps())).rejects.toThrow('redirected too often');
  });

  it('refuses a station that answers with an error, an address that is not http, and passes on a failed request', async () => {
    answerWith(http, respond(503, {}));
    await expect(openRadioStream('abc', new AbortController().signal, deps())).rejects.toThrow('answered 503');

    await expect(openRadioStream('abc', new AbortController().signal, { ...deps(), resolveStream: async () => 'file:///etc/passwd' })).rejects.toThrow(
      'not an http address'
    );

    vi.mocked(http.get).mockImplementation(() => {
      const request = new EventEmitter();
      queueMicrotask(() => request.emit('error', new Error('refused')));
      return request as never;
    });
    await expect(openRadioStream('abc', new AbortController().signal, deps())).rejects.toThrow('refused');
  });

  it('has ffmpeg decode a stream of a codec that it decodes, and tells the rate of the WAV', async () => {
    answerWith(http, respond(200, { 'content-type': 'audio/mpeg' }, mp3));
    const decoded = new PassThrough();
    vi.mocked(decodeStream).mockImplementation(async (_head, _rest, _encoder, onSampleRate) => {
      onSampleRate(44100);
      return decoded;
    });
    const stationDeps = deps();

    const { contentType, audio } = await openRadioStream('abc', new AbortController().signal, stationDeps);

    expect(contentType).toBe('audio/wav');
    expect(audio).toBe(decoded);
    expect(vi.mocked(decodeStream).mock.calls[0][0].equals(mp3)).toBe(true);
    expect(vi.mocked(decodeStream).mock.calls[0][2]).toEqual(['-c:a', 'pcm_f32le']);
    expect(stationDeps.onSampleRate).toHaveBeenCalledWith('abc', 44100);
  });

  it('plays the stream as it is when ffmpeg does not start', async () => {
    answerWith(http, respond(200, { 'content-type': 'audio/mpeg' }, mp3));
    const stationDeps = deps();

    const { contentType, audio } = await openRadioStream('abc', new AbortController().signal, stationDeps);

    expect(contentType).toBe('audio/mpeg');
    expect((await read(audio)).length).toBe(mp3.length);
    expect(stationDeps.onSampleRate).toHaveBeenCalledWith('abc', 44100);
  });

  it('does not start ffmpeg for a station that is aborted while its format is read', async () => {
    const controller = new AbortController();
    const response = respond(200, {}, mp3);
    answerWith(http, response);
    response.once('resume', () => controller.abort());

    await expect(openRadioStream('abc', controller.signal, deps())).rejects.toThrow('aborted');
    expect(decodeStream).not.toHaveBeenCalled();
  });

  it('does not have ffmpeg decode AAC, which Chromium plays', async () => {
    const frame = (length: number) =>
      Buffer.concat([Buffer.from([0xff, 0xf1, (1 << 6) | (4 << 2), 0, length >> 3, ((length & 7) << 5) | 0x1f, 0xfc]), Buffer.alloc(length - 7)]);

    answerWith(http, respond(200, { 'content-type': 'audio/aac' }, Buffer.concat([frame(300), frame(300)])));
    await openRadioStream('abc', new AbortController().signal, deps());

    expect(decodeStream).not.toHaveBeenCalled();
  });
});
