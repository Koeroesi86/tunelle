import { describe, expect, it } from 'vitest';
import { favouriteRowSchema, playlistEntryRowSchema } from './rows';

describe('row schemas', () => {
  it('reads the snapshot and renames the column', () => {
    expect(favouriteRowSchema.parse({ source: 'a', kind: 'b', id: 'c', snapshot: '{"x":1}', added_at: 5 })).toEqual({
      source: 'a',
      kind: 'b',
      id: 'c',
      snapshot: { x: 1 },
      addedAt: 5,
    });
  });

  it('refuses a snapshot that is not JSON and a number that is text', () => {
    expect(favouriteRowSchema.safeParse({ source: 'a', kind: 'b', id: 'c', snapshot: '{', added_at: 5 }).error?.issues[0].path).toEqual(['snapshot']);
    expect(playlistEntryRowSchema.safeParse({ id: '1', playlist_id: 1, path: 'p', snapshot: '1' }).error?.issues[0].path).toEqual(['id']);
  });
});
