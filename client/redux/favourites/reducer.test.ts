import { describe, expect, it } from 'vitest';
import type { Favourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import { stationFavourite, trackFavourite } from '../../utils/favourites';
import reducer from './reducer';

const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
const other: RadioStation = { ...station, uuid: 'def', name: 'Rock FM' };
const abcTrack: Track = { path: 'abc', artist: '', album: '', title: 'abc', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 };
const stored: Favourite = { ...stationFavourite(station), addedAt: 1, available: false };

describe('favourites reducer', () => {
  it('starts without favourites', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual([]);
  });

  it('stores the favourites the main process reports', () => {
    expect(reducer([], { type: 'FAVOURITES_LOADED', payload: { favourites: [stored] } })).toEqual([stored]);
  });

  it('adds a favourite in front of the others, available', () => {
    const next = reducer([stored], { type: 'ADD_FAVOURITE', payload: { favourite: stationFavourite(other) } });

    expect(next.map(({ id }) => id)).toEqual(['def', 'abc']);
    expect(next[0]).toMatchObject({ available: true, snapshot: other });
  });

  it('keeps the list as it is when the favourite is added again', () => {
    const state = [stored];

    expect(reducer(state, { type: 'ADD_FAVOURITE', payload: { favourite: stationFavourite(station) } })).toBe(state);
  });

  it('removes a favourite by its key and nothing of another source or kind', () => {
    const track: Favourite = { ...trackFavourite(abcTrack), addedAt: 2, available: true };
    const next = reducer([stored, track], { type: 'REMOVE_FAVOURITE', payload: { key: { source: 'radio', kind: 'station', id: 'abc' } } });

    expect(next).toEqual([track]);
  });

  it('ignores unrelated and malformed actions', () => {
    const state = [stored];

    expect(reducer(state, { type: 'SET_VOLUME', payload: { volume: 1 } })).toBe(state);
    expect(reducer(state, 'nope' as never)).toBe(state);
  });
});
