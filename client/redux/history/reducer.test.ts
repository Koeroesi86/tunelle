import { describe, expect, it } from 'vitest';
import type { HistoryItem } from '@shared/types/favourites';
import type { RadioStation } from '@shared/types/radio';
import { stationFavourite } from '../../domain/favourites';
import reducer from './reducer';

const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
const item: HistoryItem = { ...stationFavourite(station), playedAt: 1, available: true };

describe('history reducer', () => {
  it('starts without history', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual([]);
  });

  it('stores the history the main process reports', () => {
    expect(reducer([], { type: 'HISTORY_LOADED', payload: { history: [item] } })).toEqual([item]);
  });

  it('clears the history at once', () => {
    expect(reducer([item], { type: 'CLEAR_HISTORY' })).toEqual([]);
  });

  it('ignores unknown actions', () => {
    const state = [item];

    expect(reducer(state, { type: 'UNKNOWN' })).toBe(state);
    expect(reducer(state, null as never)).toBe(state);
  });
});
