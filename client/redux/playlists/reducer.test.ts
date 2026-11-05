import { describe, expect, it } from 'vitest';
import type { Playlist } from '@shared/types/playlists';
import reducer from './reducer';

const playlist: Playlist = { id: 1, name: 'Road', entries: [] };

describe('playlists reducer', () => {
  it('starts without playlists', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual([]);
  });

  it('stores the playlists the main process reports, in its order', () => {
    expect(reducer([], { type: 'PLAYLISTS_LOADED', payload: { playlists: [playlist, { ...playlist, id: 2 }] } }).map(({ id }) => id)).toEqual([1, 2]);
  });

  it('waits for the main process to answer a change', () => {
    const state = [playlist];

    expect(reducer(state, { type: 'DELETE_PLAYLIST', payload: { id: 1 } })).toBe(state);
  });
});
