import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlbumSummary, Track } from '@shared/types/library';
import { getSourceTracks } from './source-tracks';

const track = (title: string): Track => ({
  path: `/music/${title}.flac`,
  artist: '',
  album: '',
  title,
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
});
const summary: AlbumSummary = { id: 'x', title: 'Album', path: '/music', artist: '', cover: null, duration: 2, year: 2020, trackCount: 2 };

describe('getSourceTracks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives a track as it is and the tracks of an album with its tracks', async () => {
    expect(await getSourceTracks(track('a'))).toEqual([track('a')]);
    expect(await getSourceTracks({ ...summary, tracks: [track('a'), track('b')] })).toHaveLength(2);
  });

  it('fetches the tracks of an album summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [track('a'), track('b')] }))
    );

    expect((await getSourceTracks(summary)).map(({ title }) => title)).toEqual(['a', 'b']);
  });
});
