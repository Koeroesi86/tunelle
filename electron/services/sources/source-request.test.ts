import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { TLSSocket } from 'node:tls';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSource, readCertificate, readJson, toResponse } from './source-request';

vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));

const answer = (body: string | Buffer[], statusCode = 200, headers: IncomingMessage['headers'] = {}, socket?: unknown) =>
  Object.assign(Readable.from(typeof body === 'string' ? [Buffer.from(body)] : body), { statusCode, headers, socket }) as unknown as IncomingMessage;

const outgoing = () => Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn(), setTimeout: vi.fn() });

/** Makes the next request answer with this response, and gives back the request and the options it was made with */
const respondWith = (open: typeof httpsRequest, response: IncomingMessage) => {
  const sent = outgoing();
  vi.mocked(open).mockImplementationOnce((_url, options, callback) => {
    // a request answers after it was made
    queueMicrotask(() => (callback as (response: IncomingMessage) => void)(response));
    return Object.assign(sent, { options }) as never;
  });
  return sent;
};
const optionsOf = (open: typeof httpsRequest) => vi.mocked(open).mock.calls[0][1];

describe('openSource', () => {
  beforeEach(() => {
    vi.mocked(httpRequest).mockReset();
    vi.mocked(httpsRequest).mockReset();
  });

  it('asks https for an https address and http for an http address, with no pooled socket', async () => {
    respondWith(httpsRequest, answer(''));
    respondWith(httpRequest, answer(''));

    await openSource(new URL('https://music.example.com/rest/ping'));
    await openSource(new URL('http://192.168.1.5:4533/rest/ping'));

    expect(optionsOf(httpsRequest)).toMatchObject({ agent: false, method: 'GET', timeout: 10000 });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('pins the certificate that the user approved, and only that one', async () => {
    respondWith(httpsRequest, answer(''));

    await openSource(new URL('https://music.example.com'), { certificate: 'PEM' });

    expect(optionsOf(httpsRequest)).toMatchObject({ ca: ['PEM'] });
    expect(optionsOf(httpsRequest)).not.toMatchObject({ rejectUnauthorized: false });
  });

  it('accepts any certificate only for the first contact, which reads it', async () => {
    respondWith(httpsRequest, answer(''));

    await openSource(new URL('https://music.example.com'), { unpinned: true, certificate: 'PEM' });

    expect(optionsOf(httpsRequest)).toMatchObject({ rejectUnauthorized: false });
    expect(optionsOf(httpsRequest)).not.toHaveProperty('ca');
  });

  it('limits the wait for the answer and not the body, which a player may read slowly', async () => {
    const sent = respondWith(httpsRequest, answer(''));

    await openSource(new URL('https://music.example.com'));

    expect(sent.setTimeout).toHaveBeenCalledWith(0);
  });

  it('gives up with the host in the message when the server does not answer', () => {
    const sent = outgoing();
    vi.mocked(httpsRequest).mockReturnValueOnce(sent as never);
    const opened = openSource(new URL('https://music.example.com:4533/rest/ping'));

    sent.emit('timeout');
    expect(sent.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: 'music.example.com:4533 did not answer' }));

    sent.emit('error', new Error('socket hang up'));
    return expect(opened).rejects.toThrow('socket hang up');
  });
});

describe('readCertificate', () => {
  const tlsSocket = (raw: Buffer) => Object.assign(Object.create(TLSSocket.prototype), { getPeerCertificate: () => ({ raw }) });

  beforeEach(() => vi.mocked(httpsRequest).mockReset());

  it('reads the certificate that the server presents as a PEM, and closes the connection', async () => {
    const response = answer('', 200, {}, tlsSocket(Buffer.from('der-bytes')));
    const destroy = vi.spyOn(response, 'destroy');
    respondWith(httpsRequest, response);

    const pem = await readCertificate(new URL('https://music.example.com/navidrome'));

    expect(pem).toBe(`-----BEGIN CERTIFICATE-----\n${Buffer.from('der-bytes').toString('base64')}\n-----END CERTIFICATE-----\n`);
    expect(destroy).toHaveBeenCalled();
    expect(vi.mocked(httpsRequest).mock.calls[0][0]).toEqual(new URL('https://music.example.com'));
    expect(optionsOf(httpsRequest)).toMatchObject({ rejectUnauthorized: false });
  });

  it('fails for an address that does not use TLS', async () => {
    respondWith(httpRequest, answer('', 200, {}, {}));

    await expect(readCertificate(new URL('http://192.168.1.5:4533'))).rejects.toThrow('192.168.1.5:4533 does not use TLS');
  });
});

describe('readJson', () => {
  it('reads the body of an answer', async () => {
    expect(await readJson(answer('{"a":1}'), 'host')).toEqual({ a: 1 });
  });

  it.each([404, 500, 301])('fails for the status %d and closes the connection', async (status) => {
    const response = answer('{}', status);
    const destroy = vi.spyOn(response, 'destroy');

    await expect(readJson(response, 'music.example.com')).rejects.toThrow(`music.example.com answered ${status}`);
    expect(destroy).toHaveBeenCalled();
  });

  it('fails for a body that is not JSON', async () => {
    await expect(readJson(answer('<html>'), 'host')).rejects.toThrow();
  });

  it('stops reading a body that is too long', async () => {
    const megabyte = Buffer.alloc(1024 * 1024);
    const response = answer(Array.from({ length: 17 }, () => megabyte));
    const destroy = vi.spyOn(response, 'destroy');

    await expect(readJson(response, 'host')).rejects.toThrow('The answer of host is too long');
    expect(destroy).toHaveBeenCalled();
  });
});

describe('toResponse', () => {
  it('passes the status and the headers a player needs, and no others', async () => {
    const response = toResponse(
      answer('audio', 206, { 'content-type': 'audio/flac', 'content-range': 'bytes 0-4/5', 'accept-ranges': 'bytes', 'set-cookie': ['a=b'], server: 'x' })
    );

    expect(response.status).toBe(206);
    expect(Object.fromEntries(response.headers)).toEqual({ 'content-type': 'audio/flac', 'content-range': 'bytes 0-4/5', 'accept-ranges': 'bytes' });
    expect(await response.text()).toBe('audio');
  });

  it('has no body for an answer that has none', () => {
    expect(toResponse(answer('', 304)).body).toBeNull();
  });

  it('closes the connection when the player cancels', async () => {
    const source = answer('audio');
    const destroy = vi.spyOn(source, 'destroy');

    await toResponse(source).body?.cancel();

    expect(destroy).toHaveBeenCalled();
  });
});
