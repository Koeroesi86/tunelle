import { describe, expect, it } from 'vitest';
import { albumSummarySchema, groupSummarySchema, trackSchema } from './library';

const track = { path: '/a.flac', artist: 'A', album: 'B', title: 'T', year: '2000', track: '1', disk: '1', genre: 'G', picture: null, duration: 1 };

describe('library schemas', () => {
  it('reads a column that holds NULL as empty text', () => {
    expect(trackSchema.parse({ ...track, artist: null, year: null })).toMatchObject({ artist: '', year: '' });
  });

  it('names the column that has the wrong type', () => {
    expect(trackSchema.safeParse({ ...track, duration: 'long' }).error?.issues[0].path).toEqual(['duration']);
    expect(groupSummarySchema.safeParse({ key: '', name: '', albumCount: '2', trackCount: 1, cover: null, covers: [] }).error?.issues[0].path).toEqual([
      'albumCount',
    ]);
    expect(albumSummarySchema.safeParse({ id: 'x', title: 't', path: '/', artist: 'a', cover: null, duration: null, year: 1, trackCount: null }).success).toBe(
      false
    );
  });
});
