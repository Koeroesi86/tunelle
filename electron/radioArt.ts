import { createHash } from 'crypto';
import { isRecord } from '../shared/utils/is-record';
import { wait } from '../shared/utils/wait';
import { fetchOk } from './services/http';

export interface RadioArtImage {
  type: string;
  data: Buffer;
}

const lookupTimeout = 5000;
const maxImageBytes = 2_000_000;
const maxTitles = 100;

// MusicBrainz allows one request a second on average and declines the rest with a 503
const searchGap = 1100;
// a doubtful match shows no cover instead of a wrong one
const minScore = 90;
const maxCandidates = 6;

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const phrase = (text: string) => `"${text.replace(/[\\"]/g, (character) => `\\${character}`)}"`;

const splitTitle = (streamTitle: string) => {
  const match = streamTitle.trim().match(/^(.+?) - (.+)$/);
  return match ? { artist: match[1].trim(), title: match[2].trim() } : { title: streamTitle.trim() };
};

/** Without what stations add to a name: a bracketed part, `feat. …` and a ` - Radio Edit` tail */
const cleaned = (text: string) =>
  text
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();

/** The words of a text as a query that matches them in any order, without the characters of the query syntax */
const words = (text: string) =>
  `(${text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' AND ')})`;

const exact = (artist: string | undefined, title: string) =>
  artist ? `recording:${phrase(title)} AND artist:${phrase(artist)}` : `recording:${phrase(title)}`;

const loose = (artist: string | undefined, title: string) => (artist ? `recording:${words(title)} AND artist:${words(artist)}` : `recording:${words(title)}`);

/**
 * The queries for a stream title, which is usually `Artist - Title` (as the page splits it), else all of it is the title of the recording.
 * The exact one comes first, then the one without what stations add, the one that matches words, and the one for a station that sends `Title - Artist`.
 */
const queriesOf = (streamTitle: string) => {
  const { artist, title } = splitTitle(streamTitle);
  const cleanArtist = artist && cleaned(artist);
  const cleanTitle = cleaned(title) || title;

  return [
    ...new Set([
      exact(artist, title),
      exact(cleanArtist, cleanTitle),
      loose(cleanArtist, cleanTitle),
      ...(artist ? [exact(cleanTitle, cleanArtist || artist), loose(cleanTitle, cleanArtist || artist)] : []),
    ]),
  ];
};

const searchUrl = (query: string) => `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query, fmt: 'json', limit: '5' })}`;

export const getImage = async (url: string, cancel?: AbortSignal): Promise<RadioArtImage> => {
  const response = await fetchOk(url, { timeout: lookupTimeout, cancel });
  const type = response.headers.get('content-type') ?? '';
  const data = Buffer.from(await response.arrayBuffer());
  if (!type.startsWith('image/') || data.length === 0 || data.length > maxImageBytes) throw new Error('Not a usable image');

  return { type, data };
};

const isHttpUrl = (value: string | undefined): value is string => value !== undefined && URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);

const recordsOf = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

const pathOf = (kind: string, id: unknown) => (typeof id === 'string' && idPattern.test(id) ? `${kind}/${id}` : undefined);

/** The cover addresses of the release groups (the community picks a front cover for them more often), then of the releases, of the recordings that match well, best match first */
const coverUrlsOf = (answer: unknown) => {
  const releases = recordsOf(isRecord(answer) ? answer.recordings : undefined)
    .filter(({ score }) => typeof score === 'number' && score >= minScore)
    .flatMap(({ releases: found }) => recordsOf(found));
  const groups = releases.map(({ 'release-group': group }) => (isRecord(group) ? group.id : undefined));

  return [...new Set([...groups.map((id) => pathOf('release-group', id)), ...releases.map(({ id }) => pathOf('release', id))])]
    .filter((path) => path !== undefined)
    .slice(0, maxCandidates)
    .map((path) => `https://coverartarchive.org/${path}/front-500`);
};

/** The requests to MusicBrainz one after the other, each gap counted from the start of the request before it, so they stay under its limit */

const createQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>) => {
    let gap: Promise<unknown> = Promise.resolve();
    const result = tail.then(() => {
      gap = wait(searchGap);
      return task();
    });
    tail = result.catch(() => undefined).then(() => gap);
    return result;
  };
};

/** The best ranked of the images that load: all are requested at once, the ones that lose are cancelled */
const firstImage = async (urls: string[]) => {
  const cancel = new AbortController();
  const attempts = urls.map((url) => getImage(url, cancel.signal).catch(() => undefined));

  const best = attempts.reduce((previous, attempt) => previous.then((found) => found ?? attempt), Promise.resolve<RadioArtImage | undefined>(undefined));

  return best.then((image) => image ?? Promise.reject(new Error('The search found no art'))).finally(() => cancel.abort());
};

/**
 * The art of the song a station announces: the image the station names in its `StreamUrl`, else the first match of a music search, which is tried with looser queries when the exact one finds none.
 * The answer of a title is kept (also when there is none), so a title is looked up once; the oldest titles are dropped past a limit.
 */
export const createRadioArt = (userAgent: string) => {
  const queue = createQueue();
  const lookups = new Map<string, Promise<string | undefined>>();
  const images = new Map<string, RadioArtImage>();

  const fromQuery = async (query: string) => {
    const answer: unknown = await queue(async () => (await fetchOk(searchUrl(query), { headers: { 'User-Agent': userAgent }, timeout: lookupTimeout })).json());

    return firstImage(coverUrlsOf(answer));
  };

  /** The queries one after the other until one finds a cover */
  const fromSearch = (title: string) =>
    queriesOf(title).reduce((previous, query) => previous.catch(() => fromQuery(query)), Promise.reject<RadioArtImage>(new Error('No query')));

  const keyOf = (title: string) => createHash('sha1').update(title).digest('hex').slice(0, 16);

  const find = async (title: string, streamUrl: string | undefined) => {
    const image = await (isHttpUrl(streamUrl) ? getImage(streamUrl) : Promise.reject(new Error('No stream url')))
      .catch(() => fromSearch(title))
      .catch(() => undefined);
    if (image) images.set(keyOf(title), image);
    return image && keyOf(title);
  };

  const forget = () => {
    const oldest = lookups.keys().next().value;
    if (oldest === undefined) return;

    lookups.delete(oldest);
    images.delete(keyOf(oldest));
  };

  return {
    /** The key of the art of a title, undefined when none was found */
    lookup: (title: string, streamUrl?: string) => {
      const known = lookups.get(title);
      if (known) return known;

      const lookup = find(title, streamUrl);
      lookups.set(title, lookup);
      if (lookups.size > maxTitles) forget();
      return lookup;
    },
    get: (key: string) => images.get(key),
  };
};
