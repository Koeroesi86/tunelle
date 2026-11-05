import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { serveRadio } from './radioProtocol';

const listen = (server: http.Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

const metadata = (text: string) => {
  const padded = Buffer.alloc(Math.ceil(Buffer.byteLength(text) / 16) * 16);
  padded.write(text);
  return Buffer.concat([Buffer.from([padded.length / 16]), padded]);
};

describe('serveRadio', () => {
  const titles: [string, string][] = [];
  const resolved: Record<string, string> = {};
  const connections = { open: 0 };
  let station: http.Server;
  let stationUrl: string;
  const serve = (uuid: string, signal = new AbortController().signal) =>
    serveRadio(uuid, signal, {
      resolveStream: (id) => (resolved[id] ? Promise.resolve(resolved[id]) : Promise.reject(new Error('unknown station'))),
      onTitle: (id, title) => titles.push([id, title]),
    });

  beforeAll(async () => {
    station = http.createServer((request, response) => {
      if (request.url === '/icy') {
        response.writeHead(200, { 'content-type': 'audio/aac', 'icy-metaint': '4' });
        response.end(Buffer.concat([Buffer.from('aaaa'), metadata("StreamTitle='Artist - Song';"), Buffer.from('bbbb')]));
        return;
      }
      if (request.url === '/plain') {
        response.writeHead(200, { 'content-type': 'audio/mpeg' });
        response.end(`asked for metadata: ${request.headers['icy-metadata']}`);
        return;
      }
      if (request.url === '/moved') {
        response.writeHead(302, { location: '/plain' }).end();
        return;
      }
      if (request.url === '/loop') {
        response.writeHead(302, { location: '/loop' }).end();
        return;
      }
      if (request.url === '/endless') {
        connections.open += 1;
        response.writeHead(200, { 'content-type': 'audio/aac', 'icy-metaint': '4' });
        const timer = setInterval(() => response.write(Buffer.concat([Buffer.from('aaaa'), metadata("StreamTitle='Artist - Song';")])), 5);
        response.on('close', () => {
          clearInterval(timer);
          connections.open -= 1;
        });
        return;
      }
      response.writeHead(404).end();
    });
    stationUrl = `http://127.0.0.1:${await listen(station)}`;
  });

  afterAll(() => {
    station.closeAllConnections();
    station.close();
  });

  it('serves the audio of an ICY stream without its metadata and reports the title', async () => {
    resolved.icy = `${stationUrl}/icy`;

    const response = await serve('icy');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/aac');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('aaaabbbb');
    expect(titles).toContainEqual(['icy', 'Artist - Song']);
  });

  it('asks the station for metadata', async () => {
    resolved.plain = `${stationUrl}/plain`;

    expect(await (await serve('plain')).text()).toBe('asked for metadata: 1');
  });

  it('follows a redirect of the station', async () => {
    resolved.moved = `${stationUrl}/moved`;

    expect(await (await serve('moved')).text()).toBe('asked for metadata: 1');
  });

  it('answers 502 when the station redirects forever', async () => {
    resolved.loop = `${stationUrl}/loop`;

    expect((await serve('loop')).status).toBe(502);
  });

  it('streams the audio of a station that never ends and closes the station when the player cancels', async () => {
    resolved.endless = `${stationUrl}/endless`;

    const reader = (await serve('endless')).body?.getReader();
    const received: Buffer[] = [];
    while (Buffer.concat(received).length < 40) received.push(Buffer.from((await reader?.read())?.value ?? []));
    await reader?.cancel();

    expect(Buffer.concat(received).toString()).toMatch(/^(aaaa)+$/);
    await expect.poll(() => connections.open).toBe(0);
  });

  it('closes the station when the request is aborted', async () => {
    resolved.endless = `${stationUrl}/endless`;
    const abort = new AbortController();

    const reader = (await serve('endless', abort.signal)).body?.getReader();
    await reader?.read();
    abort.abort();

    await expect.poll(() => connections.open).toBe(0);
  });

  it('answers 502 when the stream is not available', async () => {
    resolved.gone = `${stationUrl}/gone`;

    expect((await serve('gone')).status).toBe(502);
  });

  it.each(['file:///etc/passwd', 'ftp://127.0.0.1/stream'])('answers 502 for the stream address %j that is not http', async (address) => {
    resolved.local = address;

    expect((await serve('local')).status).toBe(502);
  });

  it('answers 502 for a station the directory does not know', async () => {
    expect((await serve('unknown')).status).toBe(502);
  });

  it.each(['../secret', 'a b', 'x'.repeat(65), ''])('answers 404 for the invalid station %j', async (uuid) => {
    expect((await serve(uuid)).status).toBe(404);
  });
});
