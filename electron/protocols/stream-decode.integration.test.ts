import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import type { AddressInfo } from 'net';
import { readWav, toneShare } from '../test-wav';
import { wavHeader } from './wav-header';

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

// the real ffmpeg runs: the spy only gives the process that a request started
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return { ...original, spawn: vi.fn(original.spawn) };
});

const { serveRadio } = await import('./radio-protocol');
const { serveSource } = await import('./source-protocol');

const fixture = (name: string) => fs.readFileSync(path.join(root, 'e2e', 'fixtures', name));

/** The fixture with a bit flipped every `step` bytes of its middle third, as a station that sends damaged audio */
const damaged = (step: number, bit: number) => {
  const body = Buffer.from(fixture('mp3/1-concert-a.mp3'));
  const third = Math.floor(body.length / 3);
  for (let at = third; at < 2 * third; at += step) body[at] ^= bit;
  return body;
};

// the first fixture of each folder is a sine of 440 Hz
const stations: Record<string, { type: string; body: Buffer }> = {
  '/mp3': { type: 'audio/mpeg', body: fixture('mp3/1-concert-a.mp3') },
  '/vorbis': { type: 'audio/ogg', body: fixture('vorbis/1-concert-a.ogg') },
  '/flac': { type: 'audio/flac', body: fixture('flac/1-concert-a.flac') },
  '/flac-hires': { type: 'audio/flac', body: fixture('flac-hires/1-concert-a.flac') },
  // the decoder gives samples of tens of thousands for the first, which it drops with `-err_detect`, and of 13 for the second, which it does not
  '/mp3-broken-reservoir': { type: 'audio/mpeg', body: damaged(211, 1) },
  '/mp3-broken-frames': { type: 'audio/mpeg', body: damaged(97, 16) },
  '/other': { type: 'audio/mpeg', body: Buffer.from('not audio, and long enough to give ffmpeg something to refuse '.repeat(40)) },
};

describe('the streaming decode of radio stations and server tracks', () => {
  let station: http.Server;
  let stationUrl: string;
  let closed = 0;
  let live: http.ServerResponse | undefined;
  const resolved = (uuid: string) => Promise.resolve(`${stationUrl}${uuid}`);
  const radio = (name: string, signal = new AbortController().signal) =>
    serveRadio('abc', signal, { resolveStream: () => resolved(name), onTitle: vi.fn(), onSampleRate: rates });
  const rates = vi.fn();

  beforeAll(async () => {
    station = http.createServer((request, response) => {
      const found = stations[request.url ?? ''];
      if (request.url === '/live') {
        // a station that never ends
        live = response;
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
    ['/mp3', 44100, 4, true],
    ['/vorbis', 44100, 4, true],
    ['/flac', 44100, 2, false],
    ['/flac-hires', 96000, 3, false],
  ])('decodes the station %s with ffmpeg, to a WAV of the tone with its rate and depth', async (name, sampleRate, bytes, float) => {
    rates.mockClear();
    const response = await radio(name);
    const file = path.join(temp, `${name.slice(1)}.wav`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    const wav = readWav(file);

    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(rates).toHaveBeenCalledWith('abc', sampleRate);
    expect(wav.sampleRate).toBe(sampleRate);
    expect([wav.bytes, wav.float]).toEqual([bytes, float]);
    expect(Math.round(wav.seconds)).toBe(6);
    expect(toneShare(wav.samples, 440, wav.sampleRate)).toBeGreaterThan(0.9);
  });

  it.each(['/mp3-broken-reservoir', '/mp3-broken-frames'])('plays no loud burst for the damaged station %s', async (name) => {
    const file = path.join(temp, `${name.slice(1)}.wav`);
    fs.writeFileSync(file, Buffer.from(await (await radio(name)).arrayBuffer()));
    const { samples, seconds } = readWav(file);

    expect(Math.round(seconds)).toBe(6);
    expect(samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)).toBeLessThanOrEqual(2);
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

  const lastDecoder = () => vi.mocked(spawn).mock.results.at(-1)?.value;

  // ffmpeg that waits for input stays after a SIGTERM on Linux
  it('ends the decoder when the player leaves a station', async () => {
    const response = await radio('/live');
    const decoder = lastDecoder();
    const player = new AbortController();
    const playing = response.body?.pipeTo(new WritableStream(), { signal: player.signal }).catch(() => undefined);
    // the player has taken all there is, so ffmpeg waits for more of the station
    await new Promise((resolve) => setTimeout(resolve, 1000));
    player.abort();
    await playing;

    await vi.waitFor(() => expect(decoder?.signalCode ?? decoder?.exitCode).not.toBeNull(), { timeout: 5000 });
  });

  it('ends the audio and the decoder when the connection of a station breaks', async () => {
    const response = await radio('/live');
    const decoder = lastDecoder();
    const body = response.arrayBuffer();
    live?.destroy();

    await expect(body).resolves.toBeInstanceOf(ArrayBuffer);
    await vi.waitFor(() => expect(decoder?.signalCode ?? decoder?.exitCode).not.toBeNull(), { timeout: 5000 });
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

  /** A track of a server that names it so, served to the end; the id keeps its download apart from the others */
  const serverTrack = async (id: string, name: string, body: Buffer) => {
    const client = { stream: async () => new Response(new Uint8Array(body)) };
    const request = new Request(`tunelle://app/source/audio?${new URLSearchParams({ codec: name })}`);
    const response = await serveSource('audio', `subsonic:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:${id}`, request, {
      clientOf: async () => client as never,
    });
    const file = path.join(temp, `${id}.served`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    return file;
  };

  // the suffix of Subsonic, the container of Jellyfin and the codec of Plex
  it.each([
    ['m4a', 'alac/1-concert-a.m4a', 2],
    ['mov,mp4,m4a,3gp,3g2,mj2', 'alac/1-concert-a.m4a', 2],
    ['alac', 'alac/1-concert-a.m4a', 2],
    ['ape', 'ape/1-concert-a.ape', 2],
    ['wv', 'wavpack/1-concert-a.wv', 2],
    ['wavpack', 'wavpack-dsd/1-concert-a.wv', 3],
    ['aif', 'aiff/1-concert-a.aiff', 2],
    ['aifc', 'aiff/2-octave-up.aifc', 2],
    ['pcm', 'aiff/1-concert-a.aiff', 2],
    ['dsf', 'dsd/1-concert-a.dsf', 3],
    ['dsd_msbf', 'dsd/2-octave-up.dff', 3],
    ['flac', 'flac-hires/1-concert-a.flac', 3],
    ['mka', 'mka/1-concert-a.mka', 2],
  ])('decodes the server track that is named %s (%s) at the depth of the file', async (name, track, bytes) => {
    const file = await serverTrack(`${name}-${track}`.replace(/\W/g, '-'), name, fixture(track));
    const wav = readWav(file);

    expect(wav.bytes).toBe(bytes);
    expect(toneShare(wav.samples, track.includes('2-octave-up') ? 880 : 440, wav.sampleRate)).toBeGreaterThan(0.9);
  });

  it('serves an AAC track of a server as the file that was downloaded', async () => {
    const aac = fixture('aac/1-concert-a.m4a');

    expect(fs.readFileSync(await serverTrack('aac', 'm4a', aac)).equals(aac)).toBe(true);
  });

  it('keeps the peaks over full scale of a float track', async () => {
    const layout = { channels: 1, sampleRate: 44100, bytesPerSample: 4, frames: 44100, float: true };
    const samples = Float32Array.from({ length: layout.frames }, (_, frame) => 1.5 * Math.sin((2 * Math.PI * 440 * frame) / layout.sampleRate));

    const wav = readWav(await serverTrack('float', 'wav', Buffer.concat([wavHeader(layout), Buffer.from(samples.buffer)])));

    expect(wav.float).toBe(true);
    expect(Math.max(...wav.samples)).toBeCloseTo(1.5, 3);
  });
});
