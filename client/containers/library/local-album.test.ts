import { describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, Track } from '@shared/types/library';
import { fetchAlbum } from '../../services/library-api';
import { localAlbumActions } from './local-album';

vi.mock('../../services/library-api', () => ({ fetchAlbum: vi.fn() }));

const summary = { id: 'a', title: 'Album' } as AlbumSummary;
const tracks = [{ path: '/a.flac' } as Track];
const opened = { ...summary, tracks };

describe('the actions of an album of the local library', () => {
  it('fetches the album and opens it', async () => {
    vi.mocked(fetchAlbum).mockResolvedValue(opened as never);
    const dispatch = vi.fn();

    await localAlbumActions(dispatch).openAlbum(summary);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_ALBUM', payload: { album: opened } });
  });

  it('fetches the album and plays its tracks', async () => {
    vi.mocked(fetchAlbum).mockResolvedValue(opened as never);
    const dispatch = vi.fn();

    await localAlbumActions(dispatch).playAlbum(summary);

    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAY_TRACKS', payload: { tracks } });
  });

  it('logs a failure and dispatches nothing', async () => {
    vi.mocked(fetchAlbum).mockRejectedValue(new Error('gone'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dispatch = vi.fn();

    await localAlbumActions(dispatch).openAlbum(summary);

    expect(dispatch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
