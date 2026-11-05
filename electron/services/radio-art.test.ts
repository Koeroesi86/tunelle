import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioArt } from './radio-art';

type Fetcher = (url: string, init: { signal: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

const userAgent = 'Tunelle/26.11.1 ( https://example.test/tunelle )';
const release = '11111111-1111-4111-8111-111111111111';
const secondRelease = '22222222-2222-4222-8222-222222222222';
const group = '33333333-3333-4333-8333-333333333333';

const image = (type = 'image/jpeg') => new Response(Buffer.from('cover'), { headers: { 'content-type': type } });

const match = (releases: { id: string; group?: string }[] = [{ id: release, group }], score = 100) =>
  Response.json({ recordings: [{ score, releases: releases.map(({ id, group: groupId }) => ({ id, 'release-group': { id: groupId ?? group } })) }] });

const answers = (routes: Record<string, (url: string) => Response>) =>
  vi.fn<Fetcher>(async (url) => (routes[new URL(url).host] ?? (() => new Response(null, { status: 404 })))(url));

/** Lets the fake clock pass the pause between two searches, so a lookup that makes several does not wait for them */
const settle = async <T>(promise: Promise<T>) => {
  let done = false;
  const run = promise.finally(() => (done = true));
  await vi.waitFor(() => expect(done).toBe(true), { interval: 1100, timeout: 30_000 });
  return run;
};

/** The art of a station with the fetch of the app replaced by the fetcher */
const create = (fetcher: Fetcher) => {
  vi.stubGlobal('fetch', fetcher);
  const art = createRadioArt(userAgent);
  return { ...art, lookup: (title: string, streamUrl?: string) => settle(art.lookup(title, streamUrl)) };
};

describe('radio art', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('finds the cover of a title with a search and serves it by its key', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image() });
    const art = create(fetcher);

    const key = await art.lookup('Artist - Song');

    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(art.get(key ?? '')).toEqual({ type: 'image/jpeg', data: Buffer.from('cover') });
    expect(fetcher).toHaveBeenCalledWith(`https://coverartarchive.org/release-group/${group}/front-500`, expect.anything());
  });

  it('searches the recording of the title by the artist, and sends the user agent that MusicBrainz asks for', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image() });

    await create(fetcher).lookup('Artist - Song');

    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(url).searchParams.get('query')).toBe('recording:"Song" AND artist:"Artist"');
    expect(new URL(url).searchParams.get('fmt')).toBe('json');
    expect(init.headers).toEqual({ 'User-Agent': userAgent });
  });

  it('searches a title without an artist as the title of a recording, and escapes quotes and backslashes', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image() });

    await create(fetcher).lookup('The "best" \\ song');

    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('query')).toBe('recording:"The \\"best\\" \\\\ song"');
  });

  it('tries the release group first, then the releases until one has a cover', async () => {
    const fetcher = answers({
      'musicbrainz.org': () =>
        match([
          { id: release, group },
          { id: secondRelease, group },
        ]),
      'coverartarchive.org': (url) => (url.includes(secondRelease) ? image() : new Response(null, { status: 404 })),
    });

    expect(await create(fetcher).lookup('Artist - Song')).toBeDefined();
    expect(fetcher.mock.calls.map(([url]) => url).slice(1)).toEqual([
      `https://coverartarchive.org/release-group/${group}/front-500`,
      `https://coverartarchive.org/release/${release}/front-500`,
      `https://coverartarchive.org/release/${secondRelease}/front-500`,
    ]);
  });

  it('prefers the image the station names', async () => {
    const fetcher = answers({ 'station.example': () => image('image/png') });

    const key = await create(fetcher).lookup('Artist - Song', 'https://station.example/cover.png');

    expect(key).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('searches when the station address is not an image', async () => {
    const fetcher = answers({
      'station.example': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      'musicbrainz.org': () => match(),
      'coverartarchive.org': () => image(),
    });

    expect(await create(fetcher).lookup('Artist - Song', 'https://station.example/')).toBeDefined();
  });

  it.each([
    ['finds no recording', answers({ 'musicbrainz.org': () => Response.json({ recordings: [] }) })],
    ['finds only a doubtful match', answers({ 'musicbrainz.org': () => match(undefined, 60), 'coverartarchive.org': () => image() })],
    ['answers something else', answers({ 'musicbrainz.org': () => Response.json({ error: 'nope' }) })],
    ['is declined (503)', answers({ 'musicbrainz.org': () => new Response(null, { status: 503 }) })],
    ['finds a release with an id that is not one', answers({ 'musicbrainz.org': () => match([{ id: '../x', group: '../y' }]) })],
    ['finds no cover for any release', answers({ 'musicbrainz.org': () => match() })],
    ['finds a cover that is no image', answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image('text/html') })],
    ['fails', vi.fn().mockRejectedValue(new Error('offline'))],
  ])('has no art when the search %s', async (_name, fetcher) => {
    expect(await create(fetcher).lookup('Artist - Song')).toBeUndefined();
  });

  it('searches again without the brackets, the featured artist and the edit of the title', async () => {
    const fetcher = answers({
      'musicbrainz.org': (url) =>
        new URL(url).searchParams.get('query') === 'recording:"Song" AND artist:"Artist"' ? match() : Response.json({ recordings: [] }),
      'coverartarchive.org': () => image(),
    });

    expect(await create(fetcher).lookup('Artist feat. Guest - Song (Live) - Radio Edit')).toBeDefined();
    expect(fetcher.mock.calls.filter(([url]) => url.includes('musicbrainz')).map(([url]) => new URL(url).searchParams.get('query'))).toEqual([
      'recording:"Song (Live) - Radio Edit" AND artist:"Artist feat. Guest"',
      'recording:"Song" AND artist:"Artist"',
    ]);
  });

  it('searches by the words when the exact search finds nothing', async () => {
    const fetcher = answers({
      'musicbrainz.org': (url) => (new URL(url).searchParams.get('query')?.includes('recording:(') ? match() : Response.json({ recordings: [] })),
      'coverartarchive.org': () => image(),
    });

    expect(await create(fetcher).lookup("Artist - Don't Stop")).toBeDefined();
    expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('query'))).toContain('recording:(Don AND t AND Stop) AND artist:(Artist)');
  });

  it('searches the other way round for a station that sends the title first', async () => {
    const fetcher = answers({
      'musicbrainz.org': (url) =>
        new URL(url).searchParams.get('query') === 'recording:"Song" AND artist:"Artist"' ? match() : Response.json({ recordings: [] }),
      'coverartarchive.org': () => image(),
    });

    expect(await create(fetcher).lookup('Song - Artist')).toBeDefined();
  });

  it('requests the covers at once and takes the best ranked one that loads', async () => {
    const started: string[] = [];
    let resolveGroup: (response: Response) => void = () => undefined;
    const groupCover = new Promise<Response>((resolve) => {
      resolveGroup = resolve;
    });
    const fetcher = vi.fn<Fetcher>(async (url) => {
      if (new URL(url).host === 'musicbrainz.org') return match([{ id: release, group }]);
      started.push(url);
      return url.includes('release-group') ? groupCover : image('image/png');
    });
    const art = create(fetcher);

    const lookup = art.lookup('Artist - Song');
    await vi.waitFor(() => expect(started).toHaveLength(2));
    resolveGroup(image('image/jpeg'));
    const key = await lookup;

    expect(art.get(key ?? '')?.type).toBe('image/jpeg');
  });

  it('cancels the covers that lose', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn<Fetcher>(async (url, { signal }) => {
      if (new URL(url).host === 'musicbrainz.org') return match([{ id: release, group }]);
      signals.push(signal);
      return url.includes('release-group') ? image() : new Promise<Response>(() => undefined);
    });

    await create(fetcher).lookup('Artist - Song');

    expect(signals.map(({ aborted }) => aborted)).toEqual([true, true]);
  });

  it('counts the pause between two searches from the start of the first, and does not wait before it', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image() });
    vi.stubGlobal('fetch', fetcher);
    const art = createRadioArt(userAgent);
    const searches = () => fetcher.mock.calls.filter(([url]) => new URL(url).host === 'musicbrainz.org').length;

    const lookups = Promise.all([art.lookup('A - One'), art.lookup('B - Two')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(searches()).toBe(1);

    await vi.advanceTimersByTimeAsync(1099);
    expect(searches()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(searches()).toBe(2);
    await lookups;
  });

  it('looks a title up once, also when there was no art', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => Response.json({ recordings: [] }) });
    const art = create(fetcher);

    await art.lookup('Nothing');
    const asked = fetcher.mock.calls.length;
    await art.lookup('Nothing');

    expect(fetcher).toHaveBeenCalledTimes(asked);
  });

  it('drops the oldest titles past the limit', async () => {
    const fetcher = answers({ 'musicbrainz.org': () => match(), 'coverartarchive.org': () => image() });
    const art = create(fetcher);
    const first = await art.lookup('title 0');

    await Promise.all(Array.from({ length: 100 }, (_, index) => art.lookup(`title ${index + 1}`)));

    expect(art.get(first ?? '')).toBeUndefined();
  });
});
