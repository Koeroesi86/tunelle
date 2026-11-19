import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openRadioStream } from './radio-proxy';

vi.mock('http', () => ({ default: { get: vi.fn() } }));
vi.mock('https', () => ({ default: { get: vi.fn() } }));

const respond = (status: number, headers: Record<string, string>, body = '') => Object.assign(new PassThrough(), { statusCode: status, headers, body });
const answerWith = (client: typeof http | typeof https, ...responses: ReturnType<typeof respond>[]) =>
  vi.mocked(client.get).mockImplementation(() => {
    const request = new EventEmitter();
    const response = responses.shift();
    queueMicrotask(() => request.emit('response', response));
    return request as never;
  });
const read = async (stream: PassThrough) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};
const deps = () => ({ resolveStream: vi.fn().mockResolvedValue('http://station.example/live'), onTitle: vi.fn(), onSampleRate: vi.fn() });

describe('openRadioStream', () => {
  beforeEach(() => {
    vi.mocked(http.get).mockReset();
    vi.mocked(https.get).mockReset();
  });

  it('passes the audio of a station on with its content type, asking for the metadata', async () => {
    const upstream = respond(200, { 'content-type': 'audio/aac' });
    answerWith(http, upstream);

    const { contentType, audio } = await openRadioStream('abc', new AbortController().signal, deps());
    upstream.end('sound');

    expect(contentType).toBe('audio/aac');
    expect(await read(audio)).toBe('sound');
    expect(vi.mocked(http.get).mock.calls[0][1]).toMatchObject({ headers: { 'Icy-MetaData': '1' } });
  });

  it('takes audio/mpeg for a station that does not say, and uses https for an https address', async () => {
    answerWith(https, respond(200, {}));
    const dependencies = { ...deps(), resolveStream: vi.fn().mockResolvedValue('https://station.example/live') };

    expect((await openRadioStream('abc', new AbortController().signal, dependencies)).contentType).toBe('audio/mpeg');
    expect(https.get).toHaveBeenCalled();
  });

  it('strips the metadata of a station and tells its titles', async () => {
    const title = Buffer.from("StreamTitle='Artist - Song';".padEnd(32, '\0'));
    const upstream = respond(200, { 'icy-metaint': '4' });
    const dependencies = deps();
    answerWith(http, upstream);

    const { audio } = await openRadioStream('abc', new AbortController().signal, dependencies);
    upstream.end(Buffer.concat([Buffer.from('aaaa'), Buffer.from([2]), title, Buffer.from('bbbb')]));

    expect(await read(audio)).toBe('aaaabbbb');
    expect(dependencies.onTitle).toHaveBeenCalledWith('abc', 'Artist - Song', undefined);
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
});
