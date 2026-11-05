import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, Track } from '../../types/library';
import { fetchGroupTracks } from './group-tracks';
import { fetchAlbum, fetchAlbumPage } from '../services/library-api';

vi.mock('../services/library-api', () => ({ fetchAlbum: vi.fn(), fetchAlbumPage: vi.fn() }));

const album = (title: string) => ({ title }) as AlbumSummary;
const track = (path: string) => ({ path }) as Track;

describe('fetchGroupTracks', () => {
  beforeEach(() => {
    vi.mocked(fetchAlbumPage).mockReset();
    vi.mocked(fetchAlbum).mockReset();
    vi.mocked(fetchAlbum).mockImplementation(
      async ({ title }) => ({ title, tracks: [track(`${title}-1`), track(`${title}-2`)] }) as Awaited<ReturnType<typeof fetchAlbum>>
    );
  });

  it('collects the tracks of every album of the group, over all pages, in order', async () => {
    vi.mocked(fetchAlbumPage)
      .mockResolvedValueOnce({ items: [album('a')], total: 150 })
      .mockResolvedValueOnce({ items: [album('b')], total: 150 });

    const tracks = await fetchGroupTracks({ kind: 'genre', key: 'jazz' }, ['/music']);

    expect(tracks.map(({ path }) => path)).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
    expect(fetchAlbumPage).toHaveBeenNthCalledWith(1, 0, { sort: undefined, folders: ['/music'], search: '', group: { kind: 'genre', key: 'jazz' } });
    expect(fetchAlbumPage).toHaveBeenNthCalledWith(2, 1, expect.anything());
  });

  it('is empty for a group without albums', async () => {
    vi.mocked(fetchAlbumPage).mockResolvedValueOnce({ items: [], total: 0 });

    expect(await fetchGroupTracks({ kind: 'artist', key: 'x' }, [])).toEqual([]);
    expect(fetchAlbumPage).toHaveBeenCalledTimes(1);
  });
});
