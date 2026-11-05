import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMiddleware, createStore } from 'redux';
import type { Track } from '@shared/types/library';
import reducers from '../reducers';
import type { AppAction } from '../types';
import middleware from './middleware';

const track = (path: string): Track => ({
  path,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
});

const [a, b, c] = ['a', 'b', 'c'].map(track);

const createTestStore = (uiState: Record<string, unknown>) => {
  const store = createStore(reducers, applyMiddleware(middleware));
  store.dispatch({ type: 'RESTORE_SETTINGS', payload: { settings: { nowPlaying: [a, b, c], ...uiState } } });
  return store;
};

const dispatch = (store: ReturnType<typeof createTestStore>, action: AppAction) => store.dispatch(action);

describe('uiState middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the first track that is added to the queue when nothing is loaded', () => {
    const store = createTestStore({ nowPlaying: [] });
    dispatch(store, { type: 'ADD_TO_QUEUE', payload: { tracks: [b, c] } });

    expect(store.getState().uiState.currentSong).toEqual(b);
    expect(store.getState().uiState.nowPlaying).toEqual([b, c]);
  });

  it('starts the first track that is put next when nothing is loaded', () => {
    const store = createTestStore({ nowPlaying: [] });
    dispatch(store, { type: 'PLAY_NEXT', payload: { tracks: [b, c] } });

    expect(store.getState().uiState.currentSong).toEqual(b);
    expect(store.getState().uiState.nowPlaying).toEqual([b, c]);
  });

  it('plays the track that was put next when the song ends', () => {
    const store = createTestStore({ nowPlaying: [a, c], currentSong: a });
    dispatch(store, { type: 'PLAY_NEXT', payload: { tracks: [b] } });
    dispatch(store, { type: 'TRACK_ENDED', payload: {} });

    expect(store.getState().uiState.currentSong).toEqual(b);
  });

  it('puts a track next inside a shuffled queue as well, and shuffle picks among all of them', () => {
    const store = createTestStore({ nowPlaying: [a], currentSong: a, shuffle: true });
    dispatch(store, { type: 'PLAY_NEXT', payload: { tracks: [b] } });

    expect(store.getState().uiState.nowPlaying).toEqual([a, b]);
    expect(store.getState().uiState.upNext).toEqual(b);
  });

  it('keeps the song that plays when a track is added to the queue', () => {
    const store = createTestStore({ nowPlaying: [a], currentSong: a });
    dispatch(store, { type: 'ADD_TO_QUEUE', payload: { tracks: [b] } });

    expect(store.getState().uiState.currentSong).toEqual(a);
    expect(store.getState().uiState.nowPlaying).toEqual([a, b]);
  });

  it('plays the first track of PLAY_TRACKS', () => {
    const store = createTestStore({});
    dispatch(store, { type: 'PLAY_TRACKS', payload: { tracks: [b, c] } });

    expect(store.getState().uiState.currentSong).toEqual(b);
  });

  it('FORCE_PLAY_TRACK clears history and plays the track', () => {
    const store = createTestStore({ played: [a] });
    dispatch(store, { type: 'FORCE_PLAY_TRACK', payload: { track: c } });

    expect(store.getState().uiState).toMatchObject({ currentSong: c, played: [], isPlaying: true });
  });

  it('CLICK_NOTIFICATION opens the now playing tab', () => {
    const store = createTestStore({});
    dispatch(store, { type: 'CLICK_NOTIFICATION' });

    expect(store.getState().uiState.tab).toBe('now-playing');
  });

  describe('NEXT_SONG', () => {
    it('plays the following track and records the current one as played', () => {
      const store = createTestStore({ currentSong: a });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState).toMatchObject({ currentSong: b, played: [a] });
    });

    it('keeps the current track at the end of the queue without repeat', () => {
      const store = createTestStore({ currentSong: c });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState.currentSong).toEqual(c);
    });

    it('wraps around to the first track with repeat and does not record history', () => {
      const store = createTestStore({ currentSong: c, repeat: true });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState).toMatchObject({ currentSong: a, played: [] });
    });

    it('TRACK_ENDED advances to the next song', () => {
      const store = createTestStore({ currentSong: a });
      dispatch(store, { type: 'TRACK_ENDED', payload: {} });

      expect(store.getState().uiState.currentSong).toEqual(b);
    });

    it('shuffle picks only tracks that were not played yet', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const store = createTestStore({ currentSong: a, shuffle: true, played: [a, b] });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      // only c was not played yet
      expect(store.getState().uiState.currentSong).toEqual(c);
    });

    it('shuffle with repeat ignores history', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const store = createTestStore({ currentSong: a, shuffle: true, repeat: true, played: [a, b, c] });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState.currentSong).toEqual(c);
    });

    it('shuffle keeps the current song and stops when everything was played', () => {
      const store = createTestStore({ currentSong: a, shuffle: true, isPlaying: true, played: [a, b, c] });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState).toMatchObject({ currentSong: a, isPlaying: false });
    });

    it('stops at the end of the queue without repeat', () => {
      const store = createTestStore({ currentSong: c, isPlaying: true });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState).toMatchObject({ currentSong: c, isPlaying: false });
    });

    it('shuffle with repeat records the history', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const store = createTestStore({ currentSong: a, shuffle: true, repeat: true });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState.played).toEqual([a]);
    });
  });

  describe('PREVIOUS_SONG', () => {
    it('plays the preceding track', () => {
      const store = createTestStore({ currentSong: b });
      dispatch(store, { type: 'PREVIOUS_SONG' });

      expect(store.getState().uiState.currentSong).toEqual(a);
    });

    it('stays on the first track without repeat', () => {
      const store = createTestStore({ currentSong: a });
      dispatch(store, { type: 'PREVIOUS_SONG' });

      expect(store.getState().uiState.currentSong).toEqual(a);
    });

    it('shuffle steps back through the tracks that were played', () => {
      const store = createTestStore({ currentSong: c, shuffle: true, played: [a, b] });
      dispatch(store, { type: 'PREVIOUS_SONG' });
      expect(store.getState().uiState).toMatchObject({ currentSong: b, played: [a] });

      dispatch(store, { type: 'PREVIOUS_SONG' });
      expect(store.getState().uiState).toMatchObject({ currentSong: a, played: [] });
    });

    it('shuffle stays on the current track when nothing was played before', () => {
      const store = createTestStore({ currentSong: b, shuffle: true });
      dispatch(store, { type: 'PREVIOUS_SONG' });

      expect(store.getState().uiState.currentSong).toEqual(b);
    });

    it('wraps to the last track with repeat', () => {
      const store = createTestStore({ currentSong: a, repeat: true });
      dispatch(store, { type: 'PREVIOUS_SONG' });

      expect(store.getState().uiState.currentSong).toEqual(c);
    });
  });

  it('PLAY_RADIO_STATION plays the station as the only track', () => {
    const store = createTestStore({});
    const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
    dispatch(store, { type: 'PLAY_RADIO_STATION', payload: { station } });

    const { currentSong, nowPlaying, isPlaying } = store.getState().uiState;
    expect(currentSong).toMatchObject({ path: 'radio:abc', title: 'Jazz FM' });
    expect(nowPlaying).toEqual([currentSong]);
    expect(isPlaying).toBe(true);
  });

  describe('the track that follows', () => {
    it('is the next track of the queue', () => {
      const store = createTestStore({ currentSong: a });

      expect(store.getState().uiState.upNext).toEqual(b);
    });

    it('moves on with the current song', () => {
      const store = createTestStore({ currentSong: a });
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState.upNext).toEqual(c);
    });

    it('is the end of the queue for the last track', () => {
      const store = createTestStore({ currentSong: c });

      expect(store.getState().uiState.upNext).toBeNull();
    });

    it('follows a change of the queue', () => {
      const store = createTestStore({ currentSong: a });
      dispatch(store, { type: 'REMOVE_FROM_QUEUE', payload: { index: 1 } });

      expect(store.getState().uiState.upNext).toEqual(c);
    });

    it('is the track that Next plays with shuffle', () => {
      const store = createTestStore({ currentSong: a, shuffle: true });
      const { upNext } = store.getState().uiState;
      dispatch(store, { type: 'NEXT_SONG', payload: {} });

      expect(store.getState().uiState.currentSong).toEqual(upNext);
    });

    it('stays the same however often the state changes with shuffle', () => {
      const store = createTestStore({ currentSong: a, shuffle: true });
      const { upNext } = store.getState().uiState;
      dispatch(store, { type: 'SET_VOLUME', payload: { volume: 0.2 } });
      dispatch(store, { type: 'ADD_TO_QUEUE', payload: { tracks: [track('d')] } });

      expect(store.getState().uiState.upNext).toEqual(upNext);
    });
  });
});
