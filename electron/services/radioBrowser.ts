import { readFile, writeFile } from 'node:fs/promises';
import { resolve4, resolve6, reverse } from 'node:dns/promises';
import type { RadioOption, RadioOptionKind, RadioQuery, RadioStation, RadioTag } from '../../types/radio';
import { isRecord, type JsonRecord } from '@shared/utils/is-record';
import { fetchOk } from './http';
import { parseRadioSearch, radioSortOrders } from '../../types/radio-query';
import { radioPageSize } from '@shared/constants/radio';

const defaultDirectoryUrl = 'https://all.api.radio-browser.info';
const directoryHost = 'all.api.radio-browser.info';
// used when neither the directory, the DNS nor the cached list names a mirror
const knownMirrors = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
const requestTimeout = 10000;
// the mirrors asked at once, the first answer wins
const raceSize = 3;
const maxStoredStreams = 500;
const optionLimit = { countries: 300, languages: 300, codecs: 20 };
const tagLimit = 40;
const maxLogos = 2000;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// the audio element can not play an HLS playlist, and the directory filter for them does not catch all
const isPlayable = (value: JsonRecord) => text(value.stationuuid) && text(value.name).trim() && value.hls !== 1;

/** The logo of a station when it is a plain http(s) address */
const toLogoUrl = (value: JsonRecord) => {
  const url = URL.canParse(text(value.favicon)) ? new URL(text(value.favicon)) : undefined;

  return url && /^https?:$/.test(url.protocol) ? url.href : undefined;
};

const toStation = (value: unknown): RadioStation | undefined => {
  if (!isRecord(value) || !isPlayable(value)) return undefined;

  return {
    uuid: text(value.stationuuid),
    name: text(value.name).trim(),
    country: text(value.country),
    tags: text(value.tags).split(',').filter(Boolean),
    codec: text(value.codec),
    bitrate: count(value.bitrate),
    hasLogo: toLogoUrl(value) !== undefined,
  };
};

const toTag = (value: unknown): RadioTag | undefined =>
  isRecord(value) && text(value.name) ? { name: text(value.name), stationCount: count(value.stationcount) } : undefined;

const toServer = (value: unknown) => (isRecord(value) && text(value.name) ? `https://${text(value.name)}` : undefined);

const isMirrorHost = (name: string) => name.endsWith('.api.radio-browser.info');

/** The mirrors behind the round robin host, from the reverse records of its addresses (the way the directory documents) */
const resolveMirrors = async (host = directoryHost) => {
  const addresses = (await Promise.allSettled([resolve4(host), resolve6(host)])).flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const names = (await Promise.allSettled(addresses.map((address) => reverse(address)))).flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  return [...new Set(names.filter(isMirrorHost))].map((name) => `https://${name}`);
};

const toList = <T>(value: unknown, convert: (item: unknown) => T | undefined) => {
  if (!Array.isArray(value)) throw new Error('Unexpected answer of the station directory');

  return value.map(convert).filter((item): item is T => item !== undefined);
};

/** A stream is only played when it is a plain http(s) address */
const toStreamUrl = (value: unknown) => {
  const url = isRecord(value) && URL.canParse(text(value.url)) ? new URL(text(value.url)) : undefined;
  if (!url || !/^https?:$/.test(url.protocol)) throw new Error('The station has no playable stream');

  return url.href;
};

const shuffled = <T>(items: T[]) =>
  items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);

/** The query of a renderer message, anything but plain text is dropped */
export const toRadioQuery = parseRadioSearch;

/** The parameters of a search: only the fields of the query that are known, in the spelling of the directory */
export const toSearchParameters = ({ name, tag, country, language, codec, bitrateMin, sort, descending, offset }: RadioQuery) => {
  const parameters = new URLSearchParams({
    hidebroken: 'true',
    hls: 'false',
    order: radioSortOrders[sort ?? 'popularity'],
    reverse: `${descending !== false}`,
    limit: `${radioPageSize}`,
  });
  Object.entries({ name, tag, countrycode: country, language, codec, bitrateMin, offset })
    .filter(([, value]) => value !== undefined)
    .forEach(([key, value]) => parameters.set(key, `${value}`));
  if (language) parameters.set('languageExact', 'true');

  return parameters;
};

const toOption = (value: unknown, valueKey: string): RadioOption | undefined =>
  isRecord(value) && text(value.name) && text(value[valueKey])
    ? { value: text(value[valueKey]), name: text(value.name), stationCount: count(value.stationcount) }
    : undefined;

// the directory names a country by its code, a language and a codec by their name
const optionSources = {
  countries: { path: '/json/countries', order: 'name', valueKey: 'iso_3166_1' },
  languages: { path: '/json/languages', order: 'stationcount', valueKey: 'name' },
  codecs: { path: '/json/codecs', order: 'stationcount', valueKey: 'name' },
} satisfies Record<RadioOptionKind, { path: string; order: string; valueKey: string }>;

/** Client of the radio-browser.info API: it has no single host, so a server is picked at random and the next one is tried when it fails */
export const createRadioBrowser = (
  userAgent: string,
  directoryUrl = defaultDirectoryUrl,
  { cachePath, streamsPath, findMirrors = resolveMirrors }: { cachePath?: string; streamsPath?: string; findMirrors?: () => Promise<string[]> } = {}
) => {
  let servers: Promise<string[]> | undefined;

  const fetchJson = async (url: string, cancel?: AbortSignal): Promise<unknown> => {
    const response = await fetchOk(url, { headers: { 'User-Agent': userAgent }, timeout: requestTimeout, cancel });

    return response.json();
  };

  const listServers = () =>
    fetchJson(`${directoryUrl}/json/servers`)
      .then((list) => toList(list, toServer))
      .catch(() => []);

  // only the public directory has mirrors to look up, a directory of the environment is the only server
  const isPublicDirectory = directoryUrl === defaultDirectoryUrl;

  const readCache = async () => {
    const list: unknown = await readFile(cachePath ?? '', 'utf8').then(JSON.parse, () => []);

    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string' && URL.canParse(item)) : [];
  };

  const writeCache = (list: string[]) => (cachePath ? writeFile(cachePath, JSON.stringify(list)).catch(() => undefined) : undefined);

  const discoverServers = async () => {
    const found = shuffled(await listServers());
    if (found.length || !isPublicDirectory) return found.length ? found : [directoryUrl];
    const resolved = shuffled(await findMirrors().catch(() => []));
    if (resolved.length) await writeCache(resolved);

    return [...resolved, ...(await readCache()), ...knownMirrors, directoryUrl].filter((server, index, all) => all.indexOf(server) === index);
  };

  const getServers = () => {
    servers ??= discoverServers();
    return servers;
  };

  /** Asks a few mirrors at once and takes the first answer, the next few are asked when all of them fail */
  const fetchFrom = async (list: string[], path: string, lastError?: unknown): Promise<unknown> => {
    const [race, others] = [list.slice(0, raceSize), list.slice(raceSize)];
    if (!race.length) throw lastError ?? new Error('No station directory server is available');
    const losers = new AbortController();

    return Promise.any(race.map((server) => fetchJson(`${server}${path}`, losers.signal)))
      .finally(() => losers.abort())
      .catch((error) => fetchFrom(others, path, error instanceof AggregateError ? error.errors[0] : error));
  };

  const request = async (path: string) => fetchFrom(await getServers(), path);

  // the address of a logo is not sent to the page, which asks for it by the uuid of the station; the oldest are dropped past a limit
  const logos = new Map<string, string>();

  const toStations = (answer: unknown) => {
    const stations = toList(answer, toStation);
    (Array.isArray(answer) ? answer : [])
      .filter((value) => isRecord(value) && isPlayable(value) && toLogoUrl(value))
      .forEach((value) => {
        logos.set(text(value.stationuuid), toLogoUrl(value) ?? '');
        if (logos.size > maxLogos) logos.delete(logos.keys().next().value ?? '');
      });

    return stations;
  };

  /** A full page means that the directory may have more, the stations it lists but the app cannot play do not count */
  const searchStations = async (query: RadioQuery) => {
    const answer = await request(`/json/stations/search?${toSearchParameters(query)}`);

    return { stations: toStations(answer), hasMore: Array.isArray(answer) && answer.length >= radioPageSize };
  };

  // the lists are fetched once for the session, a failed fetch is tried again with the next request
  const options: Partial<Record<RadioOptionKind, Promise<RadioOption[]>>> = {};

  const getOptions = (kind: RadioOptionKind) => {
    const { path, order, valueKey } = optionSources[kind];
    const parameters = new URLSearchParams({ hidebroken: 'true', order, reverse: `${order !== 'name'}`, limit: `${optionLimit[kind]}` });
    const cached =
      options[kind] ??
      request(`${path}?${parameters}`)
        .then((list) => toList(list, (item) => toOption(item, valueKey)))
        .catch((error) => {
          delete options[kind];
          throw error;
        });
    options[kind] = cached;

    return cached;
  };

  const getTags = async () => {
    const parameters = new URLSearchParams({ hidebroken: 'true', order: 'stationcount', reverse: 'true', limit: `${tagLimit}` });

    return toList(await request(`/json/tags?${parameters}`), toTag);
  };

  /** The stations of the directory among the uuids, the ones it no longer lists are left out */
  const findStations = async (uuids: string[]) => {
    if (uuids.length === 0) return [];

    return toStations(await request(`/json/stations/byuuid?${new URLSearchParams({ uuids: uuids.join(',') })}`));
  };

  // the stream of every station that was played, for the time the directory can not be asked
  const readStreams = async (): Promise<Record<string, string>> => {
    const streams: unknown = await readFile(streamsPath ?? '', 'utf8').then(JSON.parse, () => ({}));

    return Object.fromEntries(Object.entries(isRecord(streams) ? streams : {}).flatMap(([uuid, url]) => (typeof url === 'string' ? [[uuid, url]] : [])));
  };

  const storeStream = async (uuid: string, url: string) => {
    if (!streamsPath) return;
    const streams = Object.entries(await readStreams()).filter(([stored]) => stored !== uuid);
    const kept = [...streams, [uuid, url]].slice(-maxStoredStreams);
    await writeFile(streamsPath, JSON.stringify(Object.fromEntries(kept))).catch(() => undefined);
  };

  /** Also registers a click of the station, which ranks it in the directory; the stream played last is used when the directory is down */
  const resolveStream = (uuid: string) =>
    request(`/json/url/${encodeURIComponent(uuid)}`)
      .then(toStreamUrl)
      .then((url) => storeStream(uuid, url).then(() => url))
      .catch(async (error) => {
        const stored = (await readStreams())[uuid];
        if (stored === undefined) throw error;

        return stored;
      });

  return { searchStations, getTags, getOptions, findStations, resolveStream, getLogoUrl: (uuid: string) => logos.get(uuid) };
};

export type RadioBrowser = ReturnType<typeof createRadioBrowser>;
