import { createHash } from 'crypto';
import { z } from 'zod';
import { wait } from '@shared/utils/wait';
import { fetchOk } from './http';

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
const maxSearchTerms = 8;

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

const musicBrainzId = z.string().regex(idPattern).optional().catch(undefined);

const releaseSchema = z.object({ id: musicBrainzId, 'release-group': z.object({ id: musicBrainzId }).optional().catch(undefined) });

const recordingSchema = z.object({ score: z.number().catch(0), releases: z.array(z.unknown()).catch([]) });

const answerSchema = z.object({ recordings: z.array(z.unknown()).catch([]) });

const pathOf = (kind: string, id: string | undefined) => (id === undefined ? undefined : `${kind}/${id}`);

/** The cover addresses of the release groups (the community picks a front cover for them more often), then of the releases, of the recordings that match well, best match first */
const coverUrlsOf = (answer: unknown) => {
  const releases = (answerSchema.safeParse(answer).data?.recordings ?? [])
    .flatMap((recording) => recordingSchema.safeParse(recording).data ?? [])
    .filter(({ score }) => score >= minScore)
    .flatMap(({ releases: found }) => found.flatMap((release) => releaseSchema.safeParse(release).data ?? []));
  const groups = releases.map((release) => release['release-group']?.id);

  return [...new Set([...groups.map((id) => pathOf('release-group', id)), ...releases.map(({ id }) => pathOf('release', id))])]
    .filter((path) => path !== undefined)
    .slice(0, maxCandidates)
    .map((path) => `https://coverartarchive.org/${path}/front-500`);
};

/** The requests to MusicBrainz one after the other, each gap counted from the end of the request before it, so they stay under its limit */ const createQueue =
  () => {
    let tail: Promise<unknown> = Promise.resolve();

    return <T>(task: () => Promise<T>) => {
      const result = tail.then(() => task());
      tail = result.catch(() => undefined).then(() => wait(searchGap));
      return result;
    };
  };

const busyRetries = 2;

const isBusy = (error: unknown) => error instanceof Error && error.message.endsWith('answered 503');

/** An answer of MusicBrainz as JSON; a 503 means that its limit was reached, so the request is made again after a longer wait. See docs/app/album-covers.md */
const musicBrainzJson = async (url: string, userAgent: string, attempt = 0): Promise<unknown> => {
  const answer = await fetchOk(url, { headers: { 'User-Agent': userAgent }, timeout: lookupTimeout }).then(
    (response) => response.json(),
    (error: unknown) => (isBusy(error) && attempt < busyRetries ? undefined : Promise.reject(error))
  );
  if (answer !== undefined) return answer;

  await wait(searchGap * (attempt + 2));
  return musicBrainzJson(url, userAgent, attempt + 1);
};

const releaseGroupUrl = (query: string) => `https://musicbrainz.org/ws/2/release-group?${new URLSearchParams({ query, fmt: 'json', limit: '8' })}`;

const releaseGroupSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string(),
  'artist-credit': z.array(z.object({ name: z.string() })).catch([]),
});

/** The albums of an answer of the search of release groups, each with the address of the small front cover the Cover Art Archive may have for it */
const albumCandidatesOf = (answer: unknown) =>
  z
    .object({ 'release-groups': z.array(z.unknown()).catch([]) })
    .safeParse(answer)
    .data?.['release-groups'].flatMap((item) => releaseGroupSchema.safeParse(item).data ?? [])
    .map((group) => ({
      name: [group['artist-credit'].map(({ name }) => name).join(', '), group.title].filter(Boolean).join(' – '),
      picture: `https://coverartarchive.org/release-group/${group.id}/front-250`,
    })) ?? [];

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
    const answer: unknown = await queue(() => musicBrainzJson(searchUrl(query), userAgent));

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
    /** The albums MusicBrainz finds for the words of a text, through the same queue as the lookups of the art (its limit is for all of them); a search that fails throws */
    searchAlbums: async (text: string) => {
      const terms = text
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, maxSearchTerms);
      if (terms.length === 0) return [];

      const query = terms.map((term) => `(releasegroup:${term} OR artist:${term})`).join(' AND ');
      const answer: unknown = await queue(() => musicBrainzJson(releaseGroupUrl(query), userAgent));
      return albumCandidatesOf(answer);
    },
  };
};

export type RadioArt = ReturnType<typeof createRadioArt>;
