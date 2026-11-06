import { describe, expect, it } from 'vitest';
import { playlistAddSchema, playlistCreateSchema, playlistMoveSchema, playlistRenameSchema } from './playlists';
import { snapshotPayloadSchema } from './favourites';

describe('playlist schemas', () => {
  it('trims and limits the name and keeps the tracks that have a path', () => {
    const parsed = playlistCreateSchema.parse({ name: `  ${'a'.repeat(300)} `, tracks: [{ path: '/a.flac', title: 'A' }, { path: '' }, 'x'] });

    expect(parsed.name).toHaveLength(200);
    expect(parsed.tracks).toEqual([{ path: '/a.flac', snapshot: { path: '/a.flac', title: 'A' } }]);
  });

  it('names the field that is wrong', () => {
    expect(playlistMoveSchema.safeParse({ id: 1, toIndex: 1.5 }).error?.issues[0].path).toEqual(['toIndex']);
    expect(playlistRenameSchema.safeParse({ id: 1, name: '   ' }).error?.issues[0].path).toEqual(['name']);
    expect(playlistAddSchema.safeParse({ id: '1' }).error?.issues[0].path).toEqual(['id']);
  });
});

describe('snapshotPayloadSchema', () => {
  const key = { source: 'radio', kind: 'station', id: 'x' };

  it.each([undefined, null, 'text', { ...key, id: '' }, { ...key, snapshot: 'text' }, { ...key, snapshot: null }])('refuses %j', (payload) => {
    expect(snapshotPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts a key with a snapshot', () => {
    expect(snapshotPayloadSchema.parse({ ...key, snapshot: { a: 1 } })).toEqual({ ...key, snapshot: { a: 1 } });
  });
});
