import { describe, expect, it } from 'vitest';
import type { RadioStation } from '@shared/types/radio';
import type { AppAction } from '../types';
import reducer from './reducer';
import type { RadioState } from './reducer';

const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };

const initial = reducer(undefined, { type: '@@INIT' });
const run = (action: AppAction, state: RadioState = initial) => reducer(state, action);

describe('radio reducer', () => {
  it('starts without stations', () => {
    expect(initial).toEqual({ query: {}, offset: 0, hasMore: false, stations: [], tags: [], countries: [], languages: [], codecs: [], loading: false });
  });

  it('is loading from a search until its stations arrive', () => {
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: { name: 'jazz' } } });
    expect(searching).toMatchObject({ query: { name: 'jazz' }, loading: true });

    const found = run({ type: 'RADIO_STATIONS', payload: { query: { name: 'jazz' }, stations: [station] } }, searching);
    expect(found).toMatchObject({ stations: [station], loading: false, error: undefined });
  });

  it('remembers the station that was played last', () => {
    expect(run({ type: 'PLAY_RADIO_STATION', payload: { station } }).playing).toEqual(station);
  });

  it('drops the stations of a search that was replaced', () => {
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: { name: 'rock' } } });

    expect(run({ type: 'RADIO_STATIONS', payload: { query: { name: 'jazz' }, stations: [station] } }, searching)).toBe(searching);
  });

  it('keeps the error of a failed search', () => {
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: {} } });

    expect(run({ type: 'RADIO_STATIONS', payload: { query: {}, stations: [], error: 'offline' } }, searching)).toMatchObject({
      error: 'offline',
      loading: false,
    });
  });

  it('clears the error of the next search', () => {
    const failed = { ...initial, error: 'offline' };

    expect(run({ type: 'SEARCH_RADIO', payload: { query: {} } }, failed).error).toBeUndefined();
  });

  it('stores the genres', () => {
    const tags = [{ name: 'jazz', stationCount: 3 }];

    expect(run({ type: 'RADIO_TAGS_LOADED', payload: { tags } }).tags).toEqual(tags);
  });

  it('drops the stations of a search with other filters or another sort', () => {
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: { country: 'HU', sort: 'name' } } });

    expect(run({ type: 'RADIO_STATIONS', payload: { query: { country: 'HU' }, stations: [station] } }, searching)).toBe(searching);
    expect(run({ type: 'RADIO_STATIONS', payload: { query: { sort: 'name' }, stations: [station] } }, searching)).toBe(searching);
    expect(run({ type: 'RADIO_STATIONS', payload: { query: { country: 'HU', sort: 'name', descending: false }, stations: [station] } }, searching)).toBe(
      searching
    );
  });

  it('drops the answer of another page', () => {
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: { name: 'a', offset: 60 } } });

    expect(searching).toMatchObject({ query: { name: 'a' }, offset: 60 });
    expect(run({ type: 'RADIO_STATIONS', payload: { query: { name: 'a' }, stations: [station] } }, searching)).toBe(searching);
  });

  it('adds the next page to the stations without repeating one', () => {
    const other = { ...station, uuid: 'def' };
    const loaded = run(
      { type: 'RADIO_STATIONS', payload: { query: {}, stations: [station], hasMore: true } },
      run({ type: 'SEARCH_RADIO', payload: { query: {} } })
    );
    const next = run({ type: 'SEARCH_RADIO', payload: { query: { offset: 60 } } }, loaded);
    const appended = run({ type: 'RADIO_STATIONS', payload: { query: { offset: 60 }, stations: [station, other], hasMore: false } }, next);

    expect(loaded.hasMore).toBe(true);
    expect(next.stations).toEqual([station]);
    expect(appended).toMatchObject({ stations: [station, other], hasMore: false, loading: false });
  });

  it('keeps the loaded stations when the next page fails, and offers it again', () => {
    const loaded = { ...initial, stations: [station], hasMore: true };
    const next = run({ type: 'SEARCH_RADIO', payload: { query: { offset: 60 } } }, loaded);

    expect(run({ type: 'RADIO_STATIONS', payload: { query: { offset: 60 }, stations: [], error: 'offline' } }, next)).toMatchObject({
      stations: [station],
      hasMore: true,
      error: 'offline',
    });
  });

  it('replaces the stations with the first page of a new search', () => {
    const loaded = { ...initial, stations: [station], hasMore: true };
    const searching = run({ type: 'SEARCH_RADIO', payload: { query: { codec: 'AAC' } } }, loaded);

    expect(run({ type: 'RADIO_STATIONS', payload: { query: { codec: 'AAC' }, stations: [], error: 'offline' } }, searching)).toMatchObject({
      stations: [],
      hasMore: false,
    });
  });

  it('stores each list of values to filter by', () => {
    const options = [{ value: 'HU', name: 'Hungary', stationCount: 4 }];

    expect(run({ type: 'RADIO_OPTIONS_LOADED', payload: { kind: 'countries', options } })).toMatchObject({ countries: options, languages: [], codecs: [] });
    expect(run({ type: 'RADIO_OPTIONS_LOADED', payload: { kind: 'codecs', options } }).codecs).toEqual(options);
  });

  it('opens with the saved query, and ignores a saved value that is not valid', () => {
    const settings = (radioQuery: unknown) => ({ type: 'RESTORE_SETTINGS' as const, payload: { settings: { radioQuery } as never } });

    expect(run(settings({ country: 'HU', sort: 'bitrate', descending: false, bitrateMin: 192 })).query).toEqual({
      country: 'HU',
      sort: 'bitrate',
      descending: false,
      bitrateMin: 192,
    });
    expect(run(settings({ sort: 'x', bitrateMin: 7, codec: 3 }), { ...initial, query: { name: 'a' } }).query).toEqual({});
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 1 } } })).toBe(initial);
  });

  it('ignores unrelated and malformed actions', () => {
    expect(run({ type: 'SET_VOLUME', payload: { volume: 1 } })).toBe(initial);
    expect(reducer(initial, 'nope' as never)).toBe(initial);
  });
});
