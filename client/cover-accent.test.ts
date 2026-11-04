import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverAccent } from './cover-accent';

const pixels = (...colours: [number, number, number, number?][]) => Uint8ClampedArray.from(colours.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

const repeat = (count: number, colour: [number, number, number, number?]) => Array.from({ length: count }, () => colour);

describe('coverAccent', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubCanvas = (data: Uint8ClampedArray) => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = () => ({ drawImage: vi.fn(), getImageData: () => ({ data }) });
      }
    );
  };

  it('picks from the downscaled cover, once per cover', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Blob(['png'])));
    vi.stubGlobal('fetch', fetchMock);
    stubCanvas(pixels(...repeat(10, [220, 40, 40])));

    await expect(coverAccent('tunelle://app/albumart/red-optimized.png')).resolves.toBe('#dc2828');
    await expect(coverAccent('tunelle://app/albumart/red-optimized.png')).resolves.toBe('#dc2828');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('takes the colour the main process stored, without reading the pixels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['png']), { headers: { 'X-Cover-Accent': '#2878dc' } })));
    stubCanvas(pixels(...repeat(10, [220, 40, 40])));

    await expect(coverAccent('tunelle://app/albumart/blue-optimized.png')).resolves.toBe('#2878dc');
  });

  it('has no colour for a cover the main process stored none for', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['png']), { headers: { 'X-Cover-Accent': '' } })));
    stubCanvas(pixels(...repeat(10, [220, 40, 40])));

    await expect(coverAccent('tunelle://app/albumart/grey-optimized.png')).resolves.toBeUndefined();
  });

  it('has no colour for a cover that cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(coverAccent('tunelle://app/albumart/missing-optimized.png')).resolves.toBeUndefined();
  });
});
