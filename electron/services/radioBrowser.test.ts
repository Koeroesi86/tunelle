import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioBrowser, toRadioQuery, toSearchParameters } from './radioBrowser';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const servers = [{ name: 'de1.api.radio-browser.info' }, { name: 'nl1.api.radio-browser.info' }];
const station = { stationuuid: 'abc-1', name: ' Jazz FM ', country: 'Hungary', tags: 'jazz,smooth,', codec: 'MP3', bitrate: 128 };

const requestedUrls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url]) => String(url));

describe('radio-browser client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('asks the directory it was given, and falls back to it when that lists no servers', async () => {
    fetchMock.mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({ url: 'http://station.example/stream' }));

    expect(await createRadioBrowser('Tunelle/1.0.0', 'http://127.0.0.1:9999').resolveStream('abc-1')).toBe('http://station.example/stream');
    expect(requestedUrls(fetchMock)).toEqual(['http://127.0.0.1:9999/json/servers', 'http://127.0.0.1:9999/json/url/abc-1']);
  });

  describe('logos', () => {
    it('flags the stations with a plain http(s) logo and keeps the address in the main process', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(
        json([
          { ...station, favicon: 'https://logo.example/jazz.png' },
          { ...station, stationuuid: 'abc-2', favicon: 'javascript:alert(1)' },
          { ...station, stationuuid: 'abc-3', favicon: '' },
        ])
      );
      const browser = createRadioBrowser('Tunelle/1.0.0');

      const { stations } = await browser.searchStations({});

      expect(stations.map(({ uuid, hasLogo }) => [uuid, hasLogo])).toEqual([
        ['abc-1', true],
        ['abc-2', false],
        ['abc-3', false],
      ]);
      expect(JSON.stringify(stations)).not.toContain('logo.example');
      expect(browser.getLogoUrl('abc-1')).toBe('https://logo.example/jazz.png');
      expect(browser.getLogoUrl('abc-2')).toBeUndefined();
    });
  });

  describe('searchStations', () => {
    it('lists the stations of a query, the most popular first', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([station]));

      const { stations, hasMore } = await createRadioBrowser('Tunelle/1.0.0').searchStations({ name: 'jazz', tag: 'smooth' });

      expect(hasMore).toBe(false);
      expect(stations).toEqual([{ uuid: 'abc-1', name: 'Jazz FM', country: 'Hungary', tags: ['jazz', 'smooth'], codec: 'MP3', bitrate: 128, hasLogo: false }]);
      const url = new URL(requestedUrls(fetchMock)[1]);
      expect(url.pathname).toBe('/json/stations/search');
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        name: 'jazz',
        tag: 'smooth',
        hidebroken: 'true',
        hls: 'false',
        order: 'clickcount',
        reverse: 'true',
      });
      expect(url.hostname).toMatch(/^(de1|nl1)\.api\.radio-browser\.info$/);
    });

    it('identifies the app with its user agent', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([]));

      await createRadioBrowser('Tunelle/1.0.0').searchStations({});

      expect(fetchMock.mock.calls.every(([, init]) => new Headers(init?.headers).get('User-Agent') === 'Tunelle/1.0.0')).toBe(true);
    });

    it('drops the entries that are not stations and the HLS streams', async () => {
      fetchMock
        .mockResolvedValueOnce(json(servers))
        .mockResolvedValueOnce(
          json([
            station,
            null,
            'x',
            { stationuuid: 'no-name' },
            { name: 'no uuid' },
            { ...station, stationuuid: 'live', hls: 1 },
            { ...station, stationuuid: 'plain', hls: 0 },
          ])
        );

      expect((await createRadioBrowser('Tunelle').searchStations({})).stations.map(({ uuid }) => uuid)).toEqual(['abc-1', 'plain']);
    });

    it('fails on an answer that is not a list', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValue(json({ error: 'nope' }));

      await expect(createRadioBrowser('Tunelle').searchStations({})).rejects.toThrow('Unexpected answer');
    });

    it('falls back to the second server after the first answered an error', async () => {
      fetchMock
        .mockResolvedValueOnce(json(servers))
        .mockResolvedValueOnce(json({}, 500))
        .mockResolvedValueOnce(json([station]));

      expect((await createRadioBrowser('Tunelle').searchStations({})).stations).toHaveLength(1);
      const [, first, second] = requestedUrls(fetchMock).map((url) => new URL(url).hostname);
      expect(first).not.toBe(second);
    });

    it('fails with the status when the directory answers an error', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValue(json({}, 500));

      await expect(createRadioBrowser('Tunelle').searchStations({})).rejects.toThrow('answered 500');
    });

    it('asks the mirrors named by the DNS when the discovery endpoint is down', async () => {
      const findMirrors = vi.fn().mockResolvedValue(['https://nl1.api.radio-browser.info']);
      fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([station]));

      const radio = createRadioBrowser('Tunelle', undefined, { findMirrors });

      expect((await radio.searchStations({})).stations).toHaveLength(1);
      expect(new URL(requestedUrls(fetchMock)[1]).hostname).toBe('nl1.api.radio-browser.info');
    });

    it('falls back to the known mirrors, and skips one that fails', async () => {
      fetchMock
        .mockResolvedValueOnce(json({}, 503))
        .mockResolvedValueOnce(json({}, 503))
        .mockResolvedValueOnce(json([station]));

      const radio = createRadioBrowser('Tunelle', undefined, { findMirrors: () => Promise.reject(new Error('no DNS')) });

      expect((await radio.searchStations({})).stations).toHaveLength(1);
      expect(
        requestedUrls(fetchMock)
          .slice(1)
          .map((url) => new URL(url).hostname)
      ).toEqual(['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info']);
    });

    it('remembers the mirrors of the DNS for the next start', async () => {
      const cachePath = join(await mkdtemp(join(tmpdir(), 'radio-')), 'mirrors.json');
      const findMirrors = vi.fn().mockResolvedValueOnce(['https://nl1.api.radio-browser.info']).mockRejectedValue(new Error('no DNS'));
      fetchMock.mockResolvedValue(json({}, 503));
      await createRadioBrowser('Tunelle', undefined, { cachePath, findMirrors })
        .searchStations({})
        .catch(() => undefined);
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([station]));

      await createRadioBrowser('Tunelle', undefined, { cachePath, findMirrors }).searchStations({});

      expect(new URL(requestedUrls(fetchMock)[1]).hostname).toBe('nl1.api.radio-browser.info');
    });

    it('uses only the directory of the environment when it lists no servers', async () => {
      const findMirrors = vi.fn();
      fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json([station]));

      await createRadioBrowser('Tunelle', 'http://127.0.0.1:9999', { findMirrors }).searchStations({});

      expect(findMirrors).not.toHaveBeenCalled();
      expect(requestedUrls(fetchMock)[1]).toContain('http://127.0.0.1:9999/json/stations/search');
    });

    it('asks several mirrors at once and takes the first answer', async () => {
      fetchMock
        .mockResolvedValueOnce(json(servers))
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(json([station]));

      const { stations } = await createRadioBrowser('Tunelle').searchStations({});

      expect(stations).toHaveLength(1);
      expect(requestedUrls(fetchMock).filter((url) => url.includes('/json/stations/search'))).toHaveLength(2);
    });

    it('discovers the servers once', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockImplementation(() => Promise.resolve(json([])));

      const radio = createRadioBrowser('Tunelle');
      await radio.searchStations({});
      await radio.searchStations({ name: 'rock' });

      expect(requestedUrls(fetchMock).filter((url) => url.endsWith('/json/servers'))).toHaveLength(1);
    });
  });

  describe('searchStations with filters', () => {
    it('asks the directory for a combination of the filters and the sort', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([station]));

      await createRadioBrowser('Tunelle').searchStations({
        name: 'jazz',
        tag: 'smooth',
        country: 'HU',
        language: 'hungarian',
        codec: 'AAC',
        bitrateMin: 192,
        sort: 'bitrate',
        descending: false,
        offset: 60,
      });

      expect(Object.fromEntries(new URL(requestedUrls(fetchMock)[1]).searchParams)).toEqual({
        hidebroken: 'true',
        hls: 'false',
        order: 'bitrate',
        reverse: 'false',
        limit: '60',
        name: 'jazz',
        tag: 'smooth',
        countrycode: 'HU',
        language: 'hungarian',
        languageExact: 'true',
        codec: 'AAC',
        bitrateMin: '192',
        offset: '60',
      });
    });

    it('says there may be more when a full page came back, also if some of it can not be played', async () => {
      const page = Array.from({ length: 60 }, (_, index) => ({ ...station, stationuuid: `s${index}`, hls: index === 0 ? 1 : 0 }));
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json(page));

      const { stations, hasMore } = await createRadioBrowser('Tunelle').searchStations({});

      expect(stations).toHaveLength(59);
      expect(hasMore).toBe(true);
    });
  });

  describe('getOptions', () => {
    it.each([
      ['countries', '/json/countries', { name: 'Hungary', iso_3166_1: 'HU', stationcount: 12 }, { value: 'HU', name: 'Hungary', stationCount: 12 }],
      ['languages', '/json/languages', { name: 'hungarian', stationcount: 7 }, { value: 'hungarian', name: 'hungarian', stationCount: 7 }],
      ['codecs', '/json/codecs', { name: 'AAC', stationcount: 3 }, { value: 'AAC', name: 'AAC', stationCount: 3 }],
    ] as const)('lists the %s with their station count', async (kind, path, item, option) => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([item, { stationcount: 1 }, null]));

      expect(await createRadioBrowser('Tunelle').getOptions(kind)).toEqual([option]);
      expect(new URL(requestedUrls(fetchMock)[1]).pathname).toBe(path);
    });

    it('loads a list once for the session', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValue(json([{ name: 'AAC', stationcount: 3 }]));
      const radio = createRadioBrowser('Tunelle');

      await radio.getOptions('codecs');
      await radio.getOptions('codecs');

      expect(requestedUrls(fetchMock).filter((url) => url.includes('/json/codecs'))).toHaveLength(2);
    });

    it('asks again after a failure', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({}, 500));
      const radio = createRadioBrowser('Tunelle');
      await expect(radio.getOptions('codecs')).rejects.toThrow('answered 500');

      fetchMock.mockResolvedValueOnce(json([{ name: 'AAC', stationcount: 3 }]));

      expect(await radio.getOptions('codecs')).toHaveLength(1);
    });
  });

  describe('getTags', () => {
    it('lists the genres with their station count', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([{ name: 'jazz', stationcount: 12 }, { name: '' }]));

      expect(await createRadioBrowser('Tunelle').getTags()).toEqual([{ name: 'jazz', stationCount: 12 }]);
      expect(new URL(requestedUrls(fetchMock)[1]).pathname).toBe('/json/tags');
    });
  });

  describe('findStations', () => {
    it('lists the stations of the directory among the uuids in one request', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json([station]));

      const stations = await createRadioBrowser('Tunelle').findStations(['abc-1', 'gone-2']);

      expect(stations.map(({ uuid }) => uuid)).toEqual(['abc-1']);
      const url = new URL(requestedUrls(fetchMock)[1]);
      expect(url.pathname).toBe('/json/stations/byuuid');
      expect(url.searchParams.get('uuids')).toBe('abc-1,gone-2');
    });

    it('does not ask the directory about no stations', async () => {
      expect(await createRadioBrowser('Tunelle').findStations([])).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('resolveStream', () => {
    it('resolves the stream address of a station', async () => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json({ ok: true, url: 'http://stream.example.com/live' }));

      expect(await createRadioBrowser('Tunelle').resolveStream('abc/1')).toBe('http://stream.example.com/live');
      expect(new URL(requestedUrls(fetchMock)[1]).pathname).toBe('/json/url/abc%2F1');
    });

    it.each(['file:///etc/passwd', 'ftp://example.com/stream', 'javascript:alert(1)', 'not a url', ''])('refuses the address %j', async (url) => {
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json({ ok: true, url }));

      await expect(createRadioBrowser('Tunelle').resolveStream('abc')).rejects.toThrow('no playable stream');
    });

    it('plays the stream it resolved last when the directory can not be asked', async () => {
      const streamsPath = join(await mkdtemp(join(tmpdir(), 'radio-')), 'streams.json');
      const options = { streamsPath, findMirrors: () => Promise.resolve([]) };
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json({ ok: true, url: 'http://stream.example.com/live' }));
      await createRadioBrowser('Tunelle', undefined, options).resolveStream('abc');
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(json({}, 503));

      const radio = createRadioBrowser('Tunelle', undefined, options);

      expect(await radio.resolveStream('abc')).toBe('http://stream.example.com/live');
      await expect(radio.resolveStream('never-played')).rejects.toThrow('answered 503');
    });

    it('prefers the answer of the directory to the stored stream', async () => {
      const streamsPath = join(await mkdtemp(join(tmpdir(), 'radio-')), 'streams.json');
      await writeFile(streamsPath, JSON.stringify({ abc: 'http://old.example.com/live' }));
      fetchMock.mockResolvedValueOnce(json(servers)).mockResolvedValueOnce(json({ url: 'http://new.example.com/live' }));

      expect(await createRadioBrowser('Tunelle', undefined, { streamsPath }).resolveStream('abc')).toBe('http://new.example.com/live');
    });
  });
});

describe('toRadioQuery', () => {
  it('keeps the trimmed text of a name and a tag', () => {
    expect(toRadioQuery({ name: '  jazz ', tag: 'smooth' })).toEqual({ name: 'jazz', tag: 'smooth' });
  });

  it('drops empty and non text values', () => {
    expect(toRadioQuery({ name: '  ', tag: 5 })).toEqual({ name: undefined, tag: undefined });
    expect(toRadioQuery(undefined)).toEqual({ name: undefined, tag: undefined });
    expect(toRadioQuery('jazz')).toEqual({ name: undefined, tag: undefined });
  });

  it('limits the length', () => {
    expect(toRadioQuery({ name: 'a'.repeat(500) }).name).toHaveLength(100);
  });
});

describe('toRadioQuery fields', () => {
  it('keeps every field of a valid query', () => {
    const query = { name: 'a', tag: 'b', country: 'HU', language: 'hungarian', codec: 'MP3', bitrateMin: 320, sort: 'votes', descending: false, offset: 120 };

    expect(toRadioQuery(query)).toEqual(query);
  });

  it('trims and limits the text of the filters', () => {
    expect(toRadioQuery({ country: ' hu ', language: 'x'.repeat(500), codec: ' ' })).toEqual({ country: 'hu', language: 'x'.repeat(100) });
  });

  it('takes the sort from the whitelist and leaves the default out', () => {
    expect(toRadioQuery({ sort: 'clicktrend' }).sort).toBeUndefined();
    expect(toRadioQuery({ sort: 'name; DROP' }).sort).toBeUndefined();
    expect(toRadioQuery({ sort: 'popularity' }).sort).toBeUndefined();
    expect(toRadioQuery({ sort: 'trending' }).sort).toBe('trending');
  });

  it('takes the direction as a boolean, descending is the default', () => {
    expect(toRadioQuery({ descending: false }).descending).toBe(false);
    expect(toRadioQuery({ descending: true }).descending).toBeUndefined();
    expect(toRadioQuery({ descending: 'false' }).descending).toBeUndefined();
  });

  it('takes a bitrate that is offered', () => {
    expect(toRadioQuery({ bitrateMin: 192 }).bitrateMin).toBe(192);
    expect(toRadioQuery({ bitrateMin: 1 }).bitrateMin).toBeUndefined();
    expect(toRadioQuery({ bitrateMin: '128' }).bitrateMin).toBeUndefined();
  });

  it('takes a positive whole offset, within limits', () => {
    expect(toRadioQuery({ offset: 60 }).offset).toBe(60);
    expect(toRadioQuery({ offset: 10 ** 9 }).offset).toBe(10000);
    expect(toRadioQuery({ offset: -1 }).offset).toBeUndefined();
    expect(toRadioQuery({ offset: 1.5 }).offset).toBeUndefined();
    expect(toRadioQuery({ offset: '60' }).offset).toBeUndefined();
  });

  it('never passes an unknown field to the URL', () => {
    const query = toRadioQuery({ name: 'a', limit: 100000, order: 'x', hidebroken: 'false' });

    expect([...toSearchParameters(query).keys()].sort()).toEqual(['hidebroken', 'hls', 'limit', 'name', 'order', 'reverse']);
    expect(toSearchParameters(query).get('limit')).toBe('60');
  });
});
