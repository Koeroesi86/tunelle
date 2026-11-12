import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSummary, summarize } from './release-summary';

const generic = { en: 'Bug fixes and improvements.', hu: 'Hibajavítások és fejlesztések.' };
const answer = (text: string) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readSummary', () => {
  it('reads both languages', () => {
    expect(readSummary('{"en":"Faster start.","hu":"Gyorsabb indítás."}')).toEqual({ en: 'Faster start.', hu: 'Gyorsabb indítás.' });
  });

  it('makes one line without a bullet, as the website lists the bullets of a release', () => {
    expect(readSummary('{"en":"- Faster\\nstart.","hu":"* Gyorsabb  indítás."}')).toEqual({ en: 'Faster start.', hu: 'Gyorsabb indítás.' });
  });

  it.each(['', 'null', 'not json', '{"en":"Only English."}', '{"en":"a","hu":""}', `{"en":"${'a'.repeat(401)}","hu":"b"}`, '{"en":1,"hu":2}'])(
    'is the generic text for %j',
    (text) => {
      expect(readSummary(text)).toEqual(generic);
    }
  );
});

describe('summarize', () => {
  const subjects = ['Add gapless playback'];
  const busy = { ok: false, status: 503, text: async () => '{"error":{"message":"This model is currently experiencing high demand."}}' };
  const good = answer('{"en":"Gapless playback.","hu":"Szünetmentes lejátszás."}');
  const summary = { en: 'Gapless playback.', hu: 'Szünetmentes lejátszás.' };

  // the pauses between the tries are timers; the request timeout is native and not faked
  const settle = async <T>(pending: Promise<T>) => {
    await vi.runAllTimersAsync();
    return pending;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('asks the Gemini API with the subjects and the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(good);
    vi.stubGlobal('fetch', fetchMock);

    const result = await summarize(['Add gapless playback', 'Update jsdom'], 'token');
    const [url, init] = fetchMock.mock.calls[0];

    expect(result).toEqual(summary);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('token');
    expect(JSON.parse(init.body).contents[0].parts[0].text).toBe('Add gapless playback\nUpdate jsdom');
  });

  it('sends at most 100 subjects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(good);
    vi.stubGlobal('fetch', fetchMock);

    await summarize(
      Array.from({ length: 150 }, (_, index) => `change ${index}`),
      'token'
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text.split('\n')).toHaveLength(100);
  });

  it.each([
    ['no commits', [], 'token'],
    ['no key', subjects, undefined],
  ])('is the generic text without asking for %s', async (_, given, token) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await summarize(given, token)).toEqual(generic);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tries again with the lighter model after a pause when the API is busy', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce(good);
    vi.stubGlobal('fetch', fetchMock);

    expect(await settle(summarize(subjects, 'token'))).toEqual(summary);
    expect(fetchMock.mock.calls.map(([url]) => url.match(/models\/([\w-]+):/)[1])).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('gives up after three tries and warns with the message of the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(busy);
    vi.stubGlobal('fetch', fetchMock);

    expect(await settle(summarize(subjects, 'token'))).toEqual(generic);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('answered 503: This model is currently experiencing high demand.'));
  });

  it('tries again after a request that took too long', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(good);
    vi.stubGlobal('fetch', fetchMock);

    expect(await settle(summarize(subjects, 'token'))).toEqual(summary);
  });

  it('gives the request a timeout, so a hanging API does not hold the release', async () => {
    const fetchMock = vi.fn().mockResolvedValue(good);
    vi.stubGlobal('fetch', fetchMock);

    await summarize(subjects, 'token');

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not try again for a key that is refused', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '{"error":{"message":"API key not valid"}}' });
    vi.stubGlobal('fetch', fetchMock);

    expect(await summarize(subjects, 'token')).toEqual(generic);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('answered 403: API key not valid'));
  });

  it('says there is no message when the error answer has none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '<html>' }));

    expect(await summarize(subjects, 'token')).toEqual(generic);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('answered 400: no message'));
  });

  it.each([
    ['an answer that is not JSON', answer('Sure! Here are the notes')],
    ['an answer without Hungarian', answer('{"en":"Only English."}')],
    ['an answer without candidates', { ok: true, status: 200, json: async () => ({}) }],
    ['an answer whose first candidate has no content', { ok: true, status: 200, json: async () => ({ candidates: [{}] }) }],
  ])('is the generic text and a warning for %s, without another try', async (_, response) => {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    expect(await summarize(subjects, 'token')).toEqual(generic);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('::warning::'));
  });

  it('is the generic text when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await summarize(subjects, 'token')).toEqual(generic);
  });
});
