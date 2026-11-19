import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBuffer } from 'music-metadata';
import { memoryFs } from '../../electron/test-memory-fs';
import { albums, startDirectory, stations, writeLibrary } from './screenshot-fixtures';

type Handler = (request: { url?: string; headers: Record<string, string> }, response: ReturnType<typeof answer>['response']) => unknown;

const served = vi.hoisted(() => ({ handler: undefined as unknown, closed: vi.fn(), closedConnections: vi.fn() }));

vi.mock('fs', () => ({ ...memoryFs.sync, default: memoryFs.sync }));
vi.mock('http', () => ({
  createServer: (handler: unknown) => {
    served.handler = handler;

    return {
      listen: (_port: number, _host: string, done: () => void) => done(),
      address: () => ({ port: 9444 }),
      close: served.closed,
      closeAllConnections: served.closedConnections,
    };
  },
}));

const answer = () => {
  const listeners: Record<string, () => void> = {};
  const response = {
    writeHead: vi.fn((_status: number, _headers?: object) => response),
    end: vi.fn((_body?: Buffer | string) => response),
    write: vi.fn((_chunk: Buffer) => true),
    on: vi.fn((event: string, listener: () => void) => void (listeners[event] = listener)),
  };

  return { response, close: () => listeners.close() };
};

describe('writeLibrary', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/library');
  });

  it('writes the tracks of every album, tagged, with the cover of the album', async () => {
    writeLibrary('/library');

    const files = memoryFs.sync
      .readdirSync('/library')
      .flatMap((album) => memoryFs.sync.readdirSync(join('/library', album)).map((file) => join('/library', album, file)));
    const tracks = await Promise.all(files.map((file) => parseBuffer(Buffer.from(memoryFs.sync.readFileSync(file)))));

    expect(tracks).toHaveLength(albums.flatMap((album) => album.tracks).length);
    expect(new Set(tracks.map(({ common }) => common.album))).toEqual(new Set(albums.map((album) => album.title)));
    expect(tracks.every(({ common }) => common.picture?.length === 1)).toBe(true);
    expect(tracks.map(({ format }) => Math.round(format.duration ?? 0)).slice(0, 4)).toEqual([167, 184, 201, 218]);
  }, 30000);

  it('names the folders and the files after the album and the track', () => {
    writeLibrary('/library');

    expect(memoryFs.sync.readdirSync('/library')).toContain('night-shift');
    expect(memoryFs.sync.readdirSync('/library/night-shift')).toEqual(['1-neon-rain.flac', '2-last-train.flac', '3-overclock.flac', '4-afterhours.flac']);
  });
});

describe('startDirectory', () => {
  const ask = (url: string, headers: Record<string, string> = {}) => {
    const { response } = answer();
    (served.handler as Handler)({ url, headers }, response);

    return response;
  };
  const body = (response: ReturnType<typeof answer>['response']) => JSON.parse(response.end.mock.calls[0][0] as string);

  beforeEach(async () => {
    await startDirectory();
  });

  it('is at the address of the server, and closes with its connections', async () => {
    const directory = await startDirectory();
    directory.close();

    expect(directory.origin).toBe('http://127.0.0.1:9444');
    expect(served.closedConnections).toHaveBeenCalled();
    expect(served.closed).toHaveBeenCalled();
  });

  it('lists the stations, in the order of the page, for a search and for the uuids', () => {
    const [search, byUuid] = [ask('/json/stations/search'), ask('/json/stations/byuuid')];

    expect(body(search).map(({ name }: { name: string }) => name)).toEqual(stations.map(({ name }) => name));
    expect(body(byUuid)).toHaveLength(stations.length);
    expect(body(search)[0]).toMatchObject({ countrycode: 'HU', codec: 'MP3', bitrate: 192, favicon: 'http://127.0.0.1:9444/logo/0.png' });
  });

  it('has no servers, resolves every station to the first and lists the options of the filters', () => {
    expect(body(ask('/json/servers'))).toEqual([]);
    expect(body(ask('/json/url/abc'))).toEqual({ url: 'http://127.0.0.1:9444/station' });
    expect(body(ask('/json/countries')).find(({ iso_3166_1 }: { iso_3166_1: string }) => iso_3166_1 === 'DE')).toMatchObject({
      name: 'Germany',
      stationcount: 2,
    });
    expect(body(ask('/json/languages'))).toEqual([{ name: 'english', stationcount: stations.length }]);
    expect(body(ask('/json/codecs')).map(({ name }: { name: string }) => name)).toEqual(expect.arrayContaining(['MP3', 'AAC', 'FLAC']));
    expect(body(ask('/json/tags')).map(({ name }: { name: string }) => name)).toContain('jazz');
  });

  it('serves a logo for each station and the cover of the announced song as images, and nothing else', () => {
    const [logo, cover, missing] = [ask('/logo/3.png'), ask('/cover.png'), ask('/other')];

    expect(logo.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'image/png' });
    expect(String(logo.end.mock.calls[0][0]).slice(1, 4)).toBe('PNG');
    expect(String(cover.end.mock.calls[0][0]).slice(1, 4)).toBe('PNG');
    expect(missing.writeHead).toHaveBeenCalledWith(404);
  });

  it('plays silence with the announced song and the cover of its album in the metadata when asked for it', () => {
    const intervals: { run: () => void; cleared: boolean }[] = [];
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((run: () => void) => intervals.push({ run, cleared: false })) as never);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id: number) => void (intervals[id - 1].cleared = true)) as never);
    const { response, close } = answer();

    (served.handler as Handler)({ url: '/station', headers: { 'icy-metadata': '1' } }, response);
    intervals[0].run();
    intervals[1].run();

    expect(response.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'audio/mpeg', 'icy-metaint': '16000' });
    expect(String(response.write.mock.calls[0][0].subarray(16000))).toContain(
      "StreamTitle='Marble Coast - Sea Wall';StreamUrl='http://127.0.0.1:9444/cover.png';".replace(
        'Marble Coast - Sea Wall',
        `${albums[4].artist} - ${albums[4].tracks[0]}`
      )
    );
    expect(response.write).toHaveBeenCalledTimes(1);
    close();
    expect(intervals.every(({ cleared }) => cleared)).toBe(true);
  });

  it('plays plain silence without the metadata when it is not asked for it', () => {
    const { response } = answer();
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((run: () => void) => (run(), 1)) as never);

    (served.handler as Handler)({ url: '/station', headers: {} }, response);

    expect(response.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'audio/mpeg' });
    expect(response.write.mock.calls[0][0]).toHaveLength(16000);
  });
});
