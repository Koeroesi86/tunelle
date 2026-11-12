import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSummary, summarize } from './release-summary';

const generic = { en: 'Bug fixes and improvements.', hu: 'Hibajavítások és fejlesztések.' };
const answer = (text: string) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

afterEach(() => {
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

  it.each(['', 'not json', '{"en":"Only English."}', '{"en":"a","hu":""}', `{"en":"${'a'.repeat(401)}","hu":"b"}`, '{"en":1,"hu":2}'])(
    'is the generic text for %j',
    (text) => {
      expect(readSummary(text)).toEqual(generic);
    }
  );
});

describe('summarize', () => {
  it('asks the Gemini API with the subjects and the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer('{"en":"Gapless playback.","hu":"Szünetmentes lejátszás."}'));
    vi.stubGlobal('fetch', fetchMock);

    const summary = await summarize(['Add gapless playback', 'Update jsdom'], 'token');
    const [url, init] = fetchMock.mock.calls[0];

    expect(summary).toEqual({ en: 'Gapless playback.', hu: 'Szünetmentes lejátszás.' });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('token');
    expect(JSON.parse(init.body).contents[0].parts[0].text).toBe('Add gapless playback\nUpdate jsdom');
  });

  it('sends at most 100 subjects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer('{"en":"a","hu":"b"}'));
    vi.stubGlobal('fetch', fetchMock);

    await summarize(
      Array.from({ length: 150 }, (_, index) => `change ${index}`),
      'token'
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text.split('\n')).toHaveLength(100);
  });

  it.each([
    ['no commits', [], 'token'],
    ['no key', ['Add gapless playback'], undefined],
  ])('is the generic text without asking for %s', async (_, subjects, token) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await summarize(subjects, token)).toEqual(generic);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an error status', { ok: false, status: 429 }],
    ['an answer that is not JSON', answer('Sure! Here are the notes')],
    ['an answer without Hungarian', answer('{"en":"Only English."}')],
    ['an answer without candidates', { ok: true, status: 200, json: async () => ({}) }],
  ])('is the generic text and a warning for %s', async (_, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await summarize(['Add gapless playback'], 'token')).toEqual(generic);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('::warning::'));
  });

  it('is the generic text when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await summarize(['Add gapless playback'], 'token')).toEqual(generic);
  });
});
