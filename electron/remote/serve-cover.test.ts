import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serveCover } from './serve-cover';

const mocks = vi.hoisted(() => ({ resolveAlbumArt: vi.fn(), serveFile: vi.fn() }));

vi.mock('../library/art/album-art', () => ({ resolveAlbumArt: mocks.resolveAlbumArt }));
vi.mock('../protocols/serve-file', () => ({ serveFile: mocks.serveFile, notFound: () => new Response(undefined, { status: 404 }) }));

describe('serveCover', () => {
  const request = new Request('https://host/remote/cover');

  beforeEach(() => {
    mocks.resolveAlbumArt.mockReset();
    mocks.serveFile.mockReset().mockResolvedValue(new Response('png'));
  });

  it('serves the picture of the album art folder that the key names, and only its file name', async () => {
    mocks.resolveAlbumArt.mockResolvedValue('/art/abc-optimized.png');

    await serveCover('../../etc/abc-optimized.png', request);

    expect(mocks.resolveAlbumArt).toHaveBeenCalledWith('abc-optimized.png');
    expect(mocks.serveFile).toHaveBeenCalledWith('/art/abc-optimized.png', request, { 'Cache-Control': 'no-store' });
  });

  it('answers 404 when the folder has no such picture', async () => {
    mocks.resolveAlbumArt.mockResolvedValue(undefined);

    expect((await serveCover('abc-optimized.png', request)).status).toBe(404);
    expect(mocks.serveFile).not.toHaveBeenCalled();
  });
});
