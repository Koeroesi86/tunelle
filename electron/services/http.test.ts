import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOk } from './http';

describe('fetchOk', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the response of a successful request, with the headers', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);

    await fetchOk('https://example.com/a', { headers: { 'User-Agent': 'Tunelle' } });

    expect(fetcher).toHaveBeenCalledWith('https://example.com/a', { headers: { 'User-Agent': 'Tunelle' }, signal: undefined });
  });

  it('throws with the host and the status when the answer is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    await expect(fetchOk('https://example.com/a')).rejects.toThrow('example.com answered 503');
  });

  it('aborts when the cancel signal aborts', async () => {
    const cancel = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));

    await fetchOk('https://example.com/a', { timeout: 1000, cancel: cancel.signal });
    const { signal } = vi.mocked(fetch).mock.calls[0][1] ?? {};
    cancel.abort();

    expect(signal?.aborted).toBe(true);
  });
});
