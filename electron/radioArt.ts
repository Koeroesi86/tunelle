import { createHash } from 'crypto';
import { setTimeout as wait } from 'timers/promises';

export interface RadioArtImage {
  type: string;
  data: Buffer;
}

export type Fetcher = (url: string, init: { signal: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

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

/** The query of a stream title, which is usually `Artist - Title` (as the page splits it), else all of it is the title of the recording */
const queryOf = (streamTitle: string) => {
  const match = streamTitle.trim().match(/^(.+?) - (.+)$/);
  return match ? `recording:${phrase(match[2].trim())} AND artist:${phrase(match[1].trim())}` : `recording:${phrase(streamTitle.trim())}`;
};

const searchUrl = (title: string) => `https://musicbrainz.org/ws/2/recording?${new URLSearchParams({ query: queryOf(title), fmt: 'json', limit: '5' })}`;

const getOk = async (fetcher: Fetcher, url: string, headers?: Record<string, string>) => {
  const response = await fetcher(url, { signal: AbortSignal.timeout(lookupTimeout), headers });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);

  return response;
};

export const getImage = async (fetcher: Fetcher, url: string): Promise<RadioArtImage> => {
  const response = await getOk(fetcher, url);
  const type = response.headers.get('content-type') ?? '';
  const data = Buffer.from(await response.arrayBuffer());
  if (!type.startsWith('image/') || data.length === 0 || data.length > maxImageBytes) throw new Error('Not a usable image');

  return { type, data };
};

const isHttpUrl = (value: string | undefined): value is string => value !== undefined && URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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

/** The requests to MusicBrainz one after the other, each followed by a pause, so they stay under its limit */
const createQueue = (pause: (milliseconds: number) => Promise<unknown>) => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>) => {
    const result = tail.then(task);
    tail = result.catch(() => undefined).then(() => pause(searchGap));
    return result;
  };
};

/** The first of the images that loads */
const firstImage = (fetcher: Fetcher, urls: string[]) =>
  urls.reduce((previous, url) => previous.catch(() => getImage(fetcher, url)), Promise.reject<RadioArtImage>(new Error('The search found no art')));

/**
 * The art of the song a station announces: the image the station names in its `StreamUrl`, else the first match of a music search.
 * The answer of a title is kept (also when there is none), so a title is looked up once; the oldest titles are dropped past a limit.
 */
export const createRadioArt = (userAgent: string, fetcher: Fetcher = fetch, pause: (milliseconds: number) => Promise<unknown> = wait) => {
  const queue = createQueue(pause);
  const lookups = new Map<string, Promise<string | undefined>>();
  const images = new Map<string, RadioArtImage>();

  const fromSearch = async (title: string) => {
    const answer: unknown = await queue(async () => (await getOk(fetcher, searchUrl(title), { 'User-Agent': userAgent })).json());

    return firstImage(fetcher, coverUrlsOf(answer));
  };

  const keyOf = (title: string) => createHash('sha1').update(title).digest('hex').slice(0, 16);

  const find = async (title: string, streamUrl: string | undefined) => {
    const image = await (isHttpUrl(streamUrl) ? getImage(fetcher, streamUrl) : Promise.reject(new Error('No stream url')))
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
