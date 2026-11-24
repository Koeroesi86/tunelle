import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AddressInfo } from 'net';
import { readWav, toneShare } from '../test-wav';

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-stream-'));

// the electron module is the only thing replaced: it says where the app is and where it may write
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => path.join(root, 'out'), getPath: () => temp },
  // net.fetch of a file slices it for a range
  net: {
    fetch: async (url: string, { headers }: { headers: Record<string, string> }) => {
      const data = fs.readFileSync(fileURLToPath(url));
      const range = headers.range?.match(/^bytes=(\d+)-(\d+)$/);
      return new Response(range ? data.subarray(Number(range[1]), Number(range[2]) + 1) : data);
    },
  },
}));

const { serveRadio } = await import('./radio-protocol');
const { serveSource } = await import('./source-protocol');

const fixture = (name: string) => fs.readFileSync(path.join(root, 'e2e', 'fixtures', name));

// the first fixture of each folder is a sine of 440 Hz
const stations: Record<string, { type: string; body: Buffer }> = {
  '/mp3': { type: 'audio/mpeg', body: fixture('mp3/1-concert-a.mp3') },
  '/vorbis': { type: 'audio/ogg', body: fixture('vorbis/1-concert-a.ogg') },
  '/flac': { type: 'audio/flac', body: fixture('flac/1-concert-a.flac') },
  '/other': { type: 'audio/mpeg', body: Buffer.from('not audio, and long enough to give ffmpeg something to refuse '.repeat(40)) },
};

describe('the streaming decode of radio stations and server tracks', () => {
  let station: http.Server;
  let stationUrl: string;
  let closed = 0;
  const resolved = (uuid: string) => Promise.resolve(`${stationUrl}${uuid}`);
  const radio = (name: string, signal = new AbortController().signal) =>
    serveRadio('abc', signal, { resolveStream: () => resolved(name), onTitle: vi.fn(), onSampleRate: rates });
  const rates = vi.fn();

  beforeAll(async () => {
    station = http.createServer((request, response) => {
      const found = stations[request.url ?? ''];
      if (request.url === '/live') {
        // a station that never ends
        response.writeHead(200, { 'content-type': 'audio/mpeg' });
        response.write(stations['/mp3'].body.subarray(0, 40_000));
        response.on('close', () => (closed += 1));
        return;
      }
      response.writeHead(200, { 'content-type': found.type });
      response.end(found.body);
    });
    await new Promise<void>((resolve) => station.listen(0, '127.0.0.1', resolve));
    stationUrl = `http://127.0.0.1:${(station.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    station.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it.each([
    ['/mp3', 44100],
    ['/vorbis', 44100],
    ['/flac', 44100],
  ])('decodes the station %s with ffmpeg, to a WAV of the tone with its rate', async (name, sampleRate) => {
    rates.mockClear();
    const response = await radio(name);
    const file = path.join(temp, `${name.slice(1)}.wav`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    const wav = readWav(file);

    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(rates).toHaveBeenCalledWith('abc', sampleRate);
    expect(wav.sampleRate).toBe(sampleRate);
    expect(Math.round(wav.seconds)).toBe(6);
    expect(toneShare(wav.samples, 440, wav.sampleRate)).toBeGreaterThan(0.9);
  });

  it('plays a stream in no known format as it comes', async () => {
    const response = await radio('/other');

    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect((await response.text()).startsWith('not audio')).toBe(true);
  });

  it('closes the connection to the station when the player leaves a decoded stream', async () => {
    closed = 0;
    const abort = new AbortController();
    const response = await radio('/live', abort.signal);
    await response.body?.cancel();

    await vi.waitFor(() => expect(closed).toBe(1));
  });

  it('downloads a server track, decodes it, and serves a range of the WAV', async () => {
    const alac = fixture('alac/1-concert-a.m4a');
    const client = { stream: vi.fn(async () => new Response(new Uint8Array(alac))) };
    const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
    const ask = (headers: Record<string, string> = {}) => new Request('tunelle://app/source/audio?codec=ALAC&bitDepth=16', { headers: { ...headers } });
    const sources = { clientOf: async () => client as never };

    const whole = await serveSource('audio', `subsonic:${serverId}:song-1`, ask(), sources);
    const file = path.join(temp, 'alac.wav');
    fs.writeFileSync(file, Buffer.from(await whole.arrayBuffer()));
    const ranged = await serveSource('audio', `subsonic:${serverId}:song-1`, ask({ range: 'bytes=1000-1999' }), sources);

    expect(toneShare(readWav(file).samples, 440, readWav(file).sampleRate)).toBeGreaterThan(0.9);
    expect(ranged.status).toBe(206);
    expect((await ranged.arrayBuffer()).byteLength).toBe(1000);
    expect(client.stream).toHaveBeenCalledTimes(1);
  });
});
