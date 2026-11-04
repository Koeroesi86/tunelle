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

  it('has no colour for a cover that cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(coverAccent('tunelle://app/albumart/missing-optimized.png')).resolves.toBeUndefined();
  });
});
