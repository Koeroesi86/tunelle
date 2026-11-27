import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadioLogos } from './radio-logos';

const fetcher = vi.hoisted(() => vi.fn<(url: string, init?: RequestInit) => Promise<Response>>());

vi.mock('electron', () => ({ net: { fetch: fetcher } }));

const png = async () => new Response(Buffer.from('logo'), { headers: { 'content-type': 'image/png' } });
const page = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
const failed = async () => new Response('gone', { status: 500, headers: { 'content-type': 'image/png' } });
const logo = { type: 'image/png', data: Buffer.from('logo') };

const logoUrl = async () => 'https://logo.example/a.png';
const askedCaches = () => fetcher.mock.calls.map(([, init]) => init?.cache);

describe('radio logos', () => {
  beforeEach(() => {
    fetcher.mockReset();
  });

  it('takes the stored copy of the logo the directory lists for a station, without cookies, once', async () => {
    fetcher.mockImplementation(png);
    const logos = createRadioLogos(async (uuid) => (uuid === 'a' ? 'https://logo.example/a.png' : undefined));

    expect(await logos.get('a')).toEqual(logo);
    expect(await logos.get('a')).toEqual(logo);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('https://logo.example/a.png', expect.objectContaining({ cache: 'force-cache', credentials: 'omit' }));
  });

  it('fetches once when the station is asked for again before its logo is there', async () => {
    fetcher.mockImplementation(png);
    const logos = createRadioLogos(logoUrl);

    expect(await Promise.all([logos.get('a'), logos.get('a')])).toEqual([logo, logo]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('has no logo for a station without a logo address', async () => {
    expect(await createRadioLogos(async () => undefined).get('a')).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['an error', failed],
    ['a page', page],
  ])('asks the server again when the stored answer is %s', async (_, answer) => {
    fetcher.mockImplementationOnce(answer).mockImplementationOnce(png);

    expect(await createRadioLogos(logoUrl).get('a')).toEqual(logo);
    expect(askedCaches()).toEqual(['force-cache', 'reload']);
  });

  it('keeps the answer of a logo that does not load, so it is not asked for again in this run', async () => {
    fetcher.mockImplementation(page);
    const logos = createRadioLogos(logoUrl);

    expect(await logos.get('a')).toBeUndefined();
    expect(await logos.get('a')).toBeUndefined();

    expect(askedCaches()).toEqual(['force-cache', 'reload']);
  });

  it('does not ask twice a server that does not answer', async () => {
    fetcher.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

    expect(await createRadioLogos(logoUrl).get('a')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
