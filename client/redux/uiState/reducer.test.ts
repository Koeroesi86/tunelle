import { describe, expect, it } from 'vitest';
import type { Album, Track } from '@shared/types/library';
import type { AppAction, PersistedSettings, UiState } from '../types';
import reducer from './reducer';

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

const initial = reducer(undefined, { type: '@@INIT' });
const run = (action: AppAction, state: UiState = initial) => reducer(state, action);

describe('uiState reducer', () => {
  it('provides sensible defaults', () => {
    expect(initial).toMatchObject({
      view: 'albums',
      libraryOpen: true,
      playlistsOpen: true,
      tab: 'home',
      volume: 0.5,
      isPlaying: false,
      shuffle: false,
      repeat: false,
      currentSong: null,
    });
    expect(initial.equalizer).toEqual(Array(10).fill(0));
  });

  it('returns the same state for unknown actions', () => {
    expect(reducer(initial, { type: 'UNKNOWN' })).toBe(initial);
    expect(reducer(initial, null as never)).toBe(initial);
  });

  it('switches views and tabs', () => {
    expect(run({ type: 'SET_VIEW', payload: { view: 'tracks' } }).view).toBe('tracks');
    expect(run({ type: 'SET_ONLINE_VIEW', payload: { view: 'radio' } }).onlineView).toBe('radio');
    expect(run({ type: 'SET_TAB', payload: { tab: 'settings' } }).tab).toBe('settings');
  });

  it('shows the albums once the added folders are scanned, and keeps any other view', () => {
    expect(run({ type: 'TRACKS_ADDED_TO_LIBRARY' }, { ...initial, view: 'folders', scanningFolder: '/music' })).toMatchObject({
      view: 'albums',
      scanningFolder: null,
    });
    expect(run({ type: 'TRACKS_ADDED_TO_LIBRARY' }, { ...initial, view: 'tracks' }).view).toBe('tracks');
  });

  it('replaces the queue and clears history on PLAY_TRACKS', () => {
    const state = run({ type: 'PLAY_TRACKS', payload: { tracks: [track('a')] } }, { ...initial, played: [track('old')] });

    expect(state.nowPlaying).toEqual([track('a')]);
    expect(state.played).toEqual([]);
  });

  describe('the queue', () => {
    const queue = { ...initial, nowPlaying: [track('a'), track('b'), track('c')] };
    const paths = (state: UiState) => state.nowPlaying.map(({ path }) => path);

    it.each([
      [0, 2, ['b', 'c', 'a']],
      [2, 0, ['c', 'a', 'b']],
      [1, 0, ['b', 'a', 'c']],
    ])('moves the track at %i to %i', (from, to, expected) => {
      expect(paths(run({ type: 'MOVE_QUEUE_TRACK', payload: { from, to } }, queue))).toEqual(expected);
    });

    it.each([
      [1, 1],
      [5, 0],
      [0, 3],
      [0, -1],
    ])('leaves the queue as it is for a move from %i to %i', (from, to) => {
      expect(run({ type: 'MOVE_QUEUE_TRACK', payload: { from, to } }, queue)).toBe(queue);
    });

    it('clears the queue, stops the song that plays and forgets the history of shuffle', () => {
      const cleared = run(
        { type: 'CLEAR_QUEUE', payload: {} },
        { ...queue, currentSong: track('b'), currentTime: 42, isPlaying: true, played: [track('a')], playNext: ['c'] }
      );

      expect(cleared.nowPlaying).toEqual([]);
      expect(cleared.currentSong).toBeNull();
      expect(cleared.currentTime).toBe(0);
      expect(cleared.isPlaying).toBe(false);
      expect(cleared.played).toEqual([]);
      expect(cleared.playNext).toEqual([]);
    });

    describe('play next', () => {
      const playing = { ...queue, nowPlaying: [track('a'), track('b'), track('c')], currentSong: track('a') };
      const playNext = (tracks: Track[], state: UiState = playing) => run({ type: 'PLAY_NEXT', payload: { tracks } }, state);

      it('puts a track right after the song that plays', () => {
        const state = playNext([track('d')]);

        expect(paths(state)).toEqual(['a', 'd', 'b', 'c']);
        expect(state.playNext).toEqual(['d']);
      });

      it('puts the next one after the one that was put next before, and keeps the order of the tracks', () => {
        const state = playNext([track('f'), track('g')], playNext([track('d'), track('e')]));

        expect(paths(state)).toEqual(['a', 'd', 'e', 'f', 'g', 'b', 'c']);
      });

      it('moves a track that is in the queue already instead of adding it a second time', () => {
        expect(paths(playNext([track('c'), track('c')]))).toEqual(['a', 'c', 'b']);
      });

      it('leaves the song that plays where it is', () => {
        expect(playNext([track('a')])).toBe(playing);
      });

      it('goes after the new song once a track that was put next plays', () => {
        const queued = playNext([track('d')]);
        const next = run({ type: 'PLAY_TRACK', payload: { track: track('d') } }, queued);

        expect(next.playNext).toEqual([]);
        expect(paths(playNext([track('e')], next))).toEqual(['a', 'd', 'e', 'b', 'c']);
      });

      it('goes to the start when nothing plays, and is forgotten with a new queue', () => {
        expect(paths(playNext([track('d')], queue))).toEqual(['d', 'a', 'b', 'c']);
        expect(run({ type: 'PLAY_TRACKS', payload: { tracks: [track('x')] } }, playNext([track('d')])).playNext).toEqual([]);
      });
    });

    it('adds tracks at the end of the queue, once, and leaves the queue as it is when all are in it', () => {
      expect(paths(run({ type: 'ADD_TO_QUEUE', payload: { tracks: [track('d'), track('a'), track('e'), track('d')] } }, queue))).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
      expect(run({ type: 'ADD_TO_QUEUE', payload: { tracks: [track('b')] } }, queue)).toBe(queue);
    });

    it('removes the track at an index and keeps the others in order', () => {
      expect(paths(run({ type: 'REMOVE_FROM_QUEUE', payload: { index: 1 } }, queue))).toEqual(['a', 'c']);
    });

    it('leaves the queue as it is when there is no track at the index', () => {
      expect(run({ type: 'REMOVE_FROM_QUEUE', payload: { index: 3 } }, queue)).toBe(queue);
    });
  });

  it('starts playing on PLAY_TRACK and falls back to no song', () => {
    const playing = run({ type: 'PLAY_TRACK', payload: { track: track('a') } });
    expect(playing).toMatchObject({ currentSong: track('a'), isPlaying: true });
    expect(run({ type: 'PLAY_TRACK', payload: { track: null } }).currentSong).toBeNull();
  });

  it('starts the next song from its beginning, not from the position of the previous one', () => {
    expect(run({ type: 'PLAY_TRACK', payload: { track: track('b') } }, { ...initial, currentSong: track('a'), currentTime: 245 }).currentTime).toBe(0);
  });

  it('parses the volume and defaults invalid values to 0', () => {
    expect(run({ type: 'SET_VOLUME', payload: { volume: '0.8' } }).volume).toBe(0.8);
    expect(run({ type: 'SET_VOLUME', payload: { volume: 0 } }).volume).toBe(0);
  });

  it('keeps the same state when the current time did not change', () => {
    const state = run({ type: 'SET_CURRENT_TIME', payload: { currentTime: '12.5' } });

    expect(state.currentTime).toBe(12.5);
    expect(reducer(state, { type: 'SET_CURRENT_TIME', payload: { currentTime: 12.5 } })).toBe(state);
  });

  it('selects and deselects an album', () => {
    const album = { id: 'a' } as Album;
    const state = run({ type: 'SELECT_ALBUM', payload: { album } });

    expect(state.selectedAlbum).toEqual(album);
    expect(run({ type: 'SELECT_ALBUM', payload: { album: null } }, state).selectedAlbum).toBeNull();
  });

  it('sets a single equalizer gain in dB without mutating the previous state', () => {
    const state = run({ type: 'SET_GAIN', payload: { value: '6.5', index: 2 } });

    expect(state.equalizer[2]).toBe(6.5);
    expect(state.equalizer[1]).toBe(0);
    expect(initial.equalizer[2]).toBe(0);
  });

  it('keeps an equalizer gain within the slider range', () => {
    expect(run({ type: 'SET_GAIN', payload: { value: 40, index: 0 } }).equalizer[0]).toBe(12);
    expect(run({ type: 'SET_GAIN', payload: { value: -40, index: 0 } }).equalizer[0]).toBe(-12);
  });

  it('sets all the equalizer gains at once, as a preset does, and keeps them within the range', () => {
    const gains = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20];
    expect(run({ type: 'SET_GAINS', payload: { gains } }).equalizer).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
    expect(run({ type: 'SET_GAINS', payload: { gains: [1] } }).equalizer).toEqual(Array(10).fill(0));
  });

  it('restores saved equalizer gains and drops ones from before gains were in dB', () => {
    const saved = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { equalizer: saved } } }).equalizer).toEqual(saved);
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { equalizer: Array(12).fill(-40) } } }).equalizer).toEqual(Array(10).fill(0));
  });

  it('tracks scanning progress and ends scanning when the rescan is complete', () => {
    const scanning = run({ type: 'SCANNING_FOLDER', payload: { folder: '/music' } });
    expect(scanning.scanningFolder).toBe('/music');
    expect(run({ type: 'SCANNING_FILE', payload: { fileName: 'a', progress: 3, totalCount: 10 } }, scanning)).toMatchObject({ progress: 3, totalCount: 10 });
    expect(run({ type: 'RESCAN_COMPLETE' }, scanning).scanningFolder).toBeNull();
  });

  it('toggles repeat and shuffle', () => {
    expect(run({ type: 'TOGGLE_REPEAT' }).repeat).toBe(true);
    expect(run({ type: 'TOGGLE_SHUFFLE' }).shuffle).toBe(true);
    expect(run({ type: 'TOGGLE_REPEAT' }, { ...initial, repeat: true }).repeat).toBe(false);
  });

  it('toggles whether the desktop blurs behind the window, off until it is turned on', () => {
    expect(initial.desktopBlur).toBe(false);
    expect(run({ type: 'TOGGLE_DESKTOP_BLUR' }).desktopBlur).toBe(true);
    expect(run({ type: 'TOGGLE_DESKTOP_BLUR' }, { ...initial, desktopBlur: true }).desktopBlur).toBe(false);
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { desktopBlur: true } } }).desktopBlur).toBe(true);
  });

  it('follows the system with the colour of the cover until a theme is picked', () => {
    expect(initial.theme).toEqual({ mode: 'system', accent: 'auto' });
  });

  it('sets the mode and the accent separately', () => {
    const dark = run({ type: 'SET_THEME_MODE', payload: { mode: 'dark' } });
    const blue = run({ type: 'SET_ACCENT', payload: { accent: '#5AA9FF' } }, dark);

    expect(dark.theme).toEqual({ mode: 'dark', accent: 'auto' });
    expect(blue.theme).toEqual({ mode: 'dark', accent: '#5aa9ff' });
    expect(run({ type: 'SET_THEME_MODE', payload: { mode: 'system' } }, blue).theme).toEqual({ mode: 'system', accent: '#5aa9ff' });
  });

  it('resets the accent with undefined, and falls back to the default for a colour that is not #rrggbb', () => {
    const blue = { ...initial, theme: { mode: 'light' as const, accent: '#5aa9ff' } };

    expect(run({ type: 'SET_ACCENT', payload: { accent: undefined } }, blue).theme).toEqual({ mode: 'light', accent: undefined });
    expect(run({ type: 'SET_ACCENT', payload: { accent: 'blue' } }, blue).theme.accent).toBeUndefined();
  });

  it('restores the saved theme, and the default for what is not valid', () => {
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { theme: { mode: 'light', accent: '#4cc38a' } } } }).theme).toEqual({
      mode: 'light',
      accent: '#4cc38a',
    });
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { theme: { mode: 'sepia', accent: 'red' } as never } } }).theme).toEqual({
      mode: 'system',
      accent: undefined,
    });
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { theme: { mode: 'dark' } as never } } }).theme).toEqual({ mode: 'dark', accent: undefined });
    expect(
      run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.2 } } }, { ...initial, theme: { mode: 'dark', accent: undefined } }).theme.mode
    ).toBe('dark');
  });

  it('follows the system language until one is picked, and restores the picked one', () => {
    expect(initial.language).toBeUndefined();
    expect(run({ type: 'SET_LANGUAGE', payload: { language: 'hu' } }).language).toBe('hu');
    expect(run({ type: 'SET_LANGUAGE', payload: { language: undefined } }, { ...initial, language: 'hu' }).language).toBeUndefined();
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { language: 'hu' } } }).language).toBe('hu');
  });

  it('records and clears played tracks, ignoring null tracks', () => {
    const one = run({ type: 'ADD_PLAYED', payload: { track: track('a') } });
    expect(one.played).toEqual([track('a')]);
    expect(run({ type: 'ADD_PLAYED', payload: { track: null } }, one).played).toEqual([track('a')]);
    expect(run({ type: 'CLEAR_PLAYED' }, one).played).toEqual([]);
    expect(run({ type: 'POP_PLAYED' }, run({ type: 'ADD_PLAYED', payload: { track: track('b') } }, one)).played).toEqual([track('a')]);
  });

  it('updates maximized and playing flags', () => {
    expect(run({ type: 'MAXIMIZED_APP', payload: { maximized: true } }).maximized).toBe(true);
    expect(run({ type: 'SET_PLAYING', payload: { isPlaying: true } }).isPlaying).toBe(true);
  });

  it('stores whether the app can be added to the application menu, and whether it was', () => {
    expect(initial.launcher).toEqual({ available: false, enabled: false, offered: false, external: false });
    expect(run({ type: 'LAUNCHER_STATE', payload: { available: true, enabled: true, offered: true, external: true } }).launcher).toEqual({
      available: true,
      enabled: true,
      offered: true,
      external: true,
    });
  });

  it('merges restored settings', () => {
    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.2, view: 'tracks' } } })).toMatchObject({
      volume: 0.2,
      view: 'tracks',
      tab: 'home',
    });
  });

  it('opens on the home screen whatever tab an earlier version saved', () => {
    const settings = JSON.parse('{ "volume": 0.2, "tab": "equalizer" }');

    expect(run({ type: 'RESTORE_SETTINGS', payload: { settings } }).tab).toBe('home');
  });

  describe('the radio query', () => {
    it('starts without filters', () => {
      expect(initial.radioQuery).toEqual({});
    });

    it('keeps the last search without its page', () => {
      expect(run({ type: 'SEARCH_RADIO', payload: { query: { country: 'HU', sort: 'name', offset: 60 } } }).radioQuery).toEqual({
        country: 'HU',
        sort: 'name',
      });
    });

    it('restores a saved query', () => {
      const saved = { ...initial, radioQuery: { name: 'a' } };

      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { radioQuery: { codec: 'AAC', bitrateMin: 320 } } } }, saved).radioQuery).toEqual({
        codec: 'AAC',
        bitrateMin: 320,
      });
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, saved).radioQuery).toEqual({ name: 'a' });
    });
  });

  describe('the sort and the folders of the library', () => {
    it('starts with the default order and all folders', () => {
      expect(initial).toMatchObject({ trackSort: undefined, albumSort: undefined, libraryFolders: [] });
    });

    it('sets and clears the sorts', () => {
      const trackSort = { field: 'year', direction: 'desc' } as const;
      const withSort = run({ type: 'SET_TRACK_SORT', payload: { sort: trackSort } });

      expect(withSort.trackSort).toEqual(trackSort);
      expect(run({ type: 'SET_TRACK_SORT', payload: { sort: undefined } }, withSort).trackSort).toBeUndefined();
      expect(run({ type: 'SET_ALBUM_SORT', payload: { sort: { field: 'title', direction: 'asc' } } }).albumSort).toEqual({ field: 'title', direction: 'asc' });
    });

    it('starts without a search, sets it, and clears it with the view', () => {
      const searching = run({ type: 'SET_LIBRARY_SEARCH', payload: { search: 'halo' } });

      expect(initial.librarySearch).toBe('');
      expect(searching.librarySearch).toBe('halo');
      expect(run({ type: 'SET_VIEW', payload: { view: 'tracks' } }, searching).librarySearch).toBe('');
    });

    it('sets and clears the sort of the artists, the album artists and the genres', () => {
      const withSort = run({ type: 'SET_GROUP_SORT', payload: { sort: { field: 'trackCount', direction: 'desc' } } });

      expect(initial.groupSort).toBeUndefined();
      expect(withSort.groupSort).toEqual({ field: 'trackCount', direction: 'desc' });
      expect(run({ type: 'SET_GROUP_SORT', payload: { sort: undefined } }, withSort).groupSort).toBeUndefined();
    });

    it('restores the saved sort of the groups', () => {
      const saved = run({ type: 'SET_GROUP_SORT', payload: { sort: { field: 'name', direction: 'desc' } } });

      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { groupSort: { field: 'albumCount', direction: 'asc' } } } }).groupSort).toEqual({
        field: 'albumCount',
        direction: 'asc',
      });
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, saved).groupSort).toEqual({ field: 'name', direction: 'desc' });
    });

    it('levels the tracks by their album by default, takes the mode that is picked, and keeps what was saved', () => {
      const track = run({ type: 'SET_NORMALIZATION', payload: { mode: 'track' } });

      expect(initial.normalization).toBe('album');
      expect(track.normalization).toBe('track');
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { normalization: 'off' } } }).normalization).toBe('off');
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, track).normalization).toBe('track');
    });

    it('picks the output device, restores a saved one and drops one that is not valid', () => {
      const dac = { id: 'a1', label: 'USB DAC' };
      const picked = run({ type: 'SET_OUTPUT_DEVICE', payload: { device: dac } });

      expect(initial.outputDevice).toBeUndefined();
      expect(picked.outputDevice).toEqual(dac);
      expect(run({ type: 'SET_OUTPUT_DEVICE', payload: { device: undefined } }, picked).outputDevice).toBeUndefined();
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { outputDevice: dac } } }).outputDevice).toEqual(dac);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { outputDevice: 'dac' as never } } }, picked).outputDevice).toBeUndefined();
    });

    it('measures the loudness unless it is turned off, and keeps what was saved', () => {
      const off = run({ type: 'SET_MEASURE_LOUDNESS', payload: { enabled: false } });

      expect(initial.measureLoudness).toBe(true);
      expect(off.measureLoudness).toBe(false);
      expect(run({ type: 'SET_MEASURE_LOUDNESS', payload: { enabled: true } }, off).measureLoudness).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { measureLoudness: false } } }).measureLoudness).toBe(false);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { measureLoudness: 'x' as never } } }, off).measureLoudness).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, off).measureLoudness).toBe(false);
    });

    it('keeps how far the measurement is, which is not saved, and shows nothing measured after the values are cleared', () => {
      const status = { total: 10, measured: 4, failed: 1 };
      const told = run({ type: 'LOUDNESS_STATUS', payload: status });

      expect(initial.loudnessStatus).toBeUndefined();
      expect(told.loudnessStatus).toEqual(status);
      expect(run({ type: 'CLEAR_MEASURED_LOUDNESS', payload: {} }, told).loudnessStatus).toEqual({ total: 10, measured: 0, failed: 0 });
      expect(run({ type: 'CLEAR_MEASURED_LOUDNESS', payload: {} }).loudnessStatus).toBeUndefined();
    });

    it('watches the library folders unless it is turned off, and keeps what was saved', () => {
      const off = run({ type: 'SET_WATCH_FOLDERS', payload: { enabled: false } });

      expect(initial.watchFolders).toBe(true);
      expect(off.watchFolders).toBe(false);
      expect(run({ type: 'SET_WATCH_FOLDERS', payload: { enabled: true } }, off).watchFolders).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { watchFolders: false } } }).watchFolders).toBe(false);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { watchFolders: 'x' as never } } }, off).watchFolders).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, off).watchFolders).toBe(false);
    });

    it('looks up the photos of the artists unless it is turned off, and keeps what was saved', () => {
      const off = run({ type: 'SET_ARTIST_PHOTOS', payload: { enabled: false } });

      expect(initial.artistPhotos).toBe(true);
      expect(off.artistPhotos).toBe(false);
      expect(run({ type: 'SET_ARTIST_PHOTOS', payload: { enabled: true } }, off).artistPhotos).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { artistPhotos: false } } }).artistPhotos).toBe(false);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { artistPhotos: 'x' as never } } }, off).artistPhotos).toBe(true);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, off).artistPhotos).toBe(false);
    });

    it('opens and closes an artist, album artist or genre, and filters the names', () => {
      const group = { kind: 'genre', key: 'pop', name: 'Pop' } as const;
      const open = run({ type: 'OPEN_GROUP', payload: { group } });

      expect(initial).toMatchObject({ openGroup: undefined, groupFilter: '' });
      expect(open.openGroup).toEqual(group);
      expect(run({ type: 'CLOSE_GROUP', payload: {} }, open).openGroup).toBeUndefined();
      expect(run({ type: 'SET_GROUP_FILTER', payload: { filter: 'po' } }).groupFilter).toBe('po');
    });

    it('starts another view without the open group and the filter of the names', () => {
      const state = run(
        { type: 'SET_GROUP_FILTER', payload: { filter: 'po' } },
        run({ type: 'OPEN_GROUP', payload: { group: { kind: 'artist', key: 'a', name: 'A' } } })
      );

      expect(run({ type: 'SET_VIEW', payload: { view: 'genres' } }, state)).toMatchObject({ view: 'genres', openGroup: undefined, groupFilter: '' });
    });

    it('sets the folders once each', () => {
      expect(run({ type: 'SET_LIBRARY_FOLDERS', payload: { folders: ['/a', '/b', '/a'] } }).libraryFolders).toEqual(['/a', '/b']);
    });

    it('drops the folders the library no longer has from the selection, and keeps the state when none left', () => {
      const selected = { ...initial, libraryFolders: ['/a', '/b'] };
      const folders = (paths: string[]) => paths.map((path) => ({ path, lastModified: 1 }));

      expect(run({ type: 'STORE_FOLDERS', payload: { folders: folders(['/b', '/c']) } }, selected).libraryFolders).toEqual(['/b']);
      expect(run({ type: 'STORE_FOLDERS', payload: { folders: folders(['/a', '/b']) } }, selected)).toBe(selected);
    });

    it('starts with the default size of the covers, sets it and keeps it in the range', () => {
      expect(initial.coverSize).toBe(160);
      expect(run({ type: 'SET_COVER_SIZE', payload: { size: 200 } }).coverSize).toBe(200);
      expect(run({ type: 'SET_COVER_SIZE', payload: { size: 900 } }).coverSize).toBe(240);
    });

    it('restores a saved size of the covers, and the default for one that is not a number', () => {
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { coverSize: 140 } } }).coverSize).toBe(140);
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { coverSize: 'big' } as never } }, { ...initial, coverSize: 200 }).coverSize).toBe(160);
    });

    it('restores a saved sort and selection', () => {
      const settings: Partial<PersistedSettings> = {
        trackSort: { field: 'artist', direction: 'desc' },
        albumSort: { field: 'trackCount', direction: 'asc' },
        libraryFolders: ['/a'],
      };

      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings } })).toMatchObject(settings);
    });

    it('keeps the sort and the selection when the saved settings have none', () => {
      const saved = { ...initial, trackSort: { field: 'title', direction: 'asc' } as const, libraryFolders: ['/a'] };

      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { volume: 0.1 } } }, saved)).toMatchObject({
        trackSort: saved.trackSort,
        libraryFolders: ['/a'],
      });
    });
  });

  describe('radio', () => {
    const playing = { ...initial, currentSong: track('radio:abc'), streamTitle: null, streamArt: null };

    it('shows the radio first', () => {
      expect(initial.onlineView).toBe('radio');
    });

    it.each(['shoutcast', 'spotify', 'unknown'])('restores the saved %s view as the radio', (saved) => {
      const settings = { onlineView: saved } as never;
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings } }).onlineView).toBe('radio');
    });

    it('keeps the title the stream announces', () => {
      expect(run({ type: 'RADIO_STREAM_TITLE', payload: { uuid: 'abc', title: 'Artist - Song' } }, playing).streamTitle).toBe('Artist - Song');
    });

    it('ignores the title of a station that is not playing', () => {
      expect(run({ type: 'RADIO_STREAM_TITLE', payload: { uuid: 'other', title: 'Artist - Song' } }, playing)).toBe(playing);
      expect(run({ type: 'RADIO_STREAM_TITLE', payload: { uuid: 'abc', title: 'Artist - Song' } })).toBe(initial);
    });

    it('forgets the title and the art when another track starts', () => {
      const titled = { ...playing, streamTitle: 'Artist - Song', streamArt: 'abcd' };
      expect(run({ type: 'PLAY_TRACK', payload: { track: track('/music/a.flac') } }, titled)).toMatchObject({ streamTitle: null, streamArt: null });
    });

    it('keeps the art of the previous song until the art of the next one arrives', () => {
      const titled = { ...playing, streamTitle: 'Artist - Song', streamArt: 'abcd' };
      const next = run({ type: 'RADIO_STREAM_TITLE', payload: { uuid: 'abc', title: 'Artist - Next' } }, titled);

      expect(next).toMatchObject({ streamTitle: 'Artist - Next', streamArt: 'abcd' });
      expect(run({ type: 'RADIO_STREAM_ART', payload: { uuid: 'abc', title: 'Artist - Next', art: 'efgh' } }, next).streamArt).toBe('efgh');
    });

    it('clears the art when none is found for the new song, which shows the logo of the station', () => {
      const titled = { ...playing, streamTitle: 'Artist - Next', streamArt: 'abcd' };
      expect(run({ type: 'RADIO_STREAM_ART', payload: { uuid: 'abc', title: 'Artist - Next' } }, titled).streamArt).toBeNull();
    });

    it('keeps the art when the station repeats the title', () => {
      const titled = { ...playing, streamTitle: 'Artist - Song', streamArt: 'abcd' };
      expect(run({ type: 'RADIO_STREAM_TITLE', payload: { uuid: 'abc', title: 'Artist - Song' } }, titled)).toBe(titled);
    });

    it('keeps the art found for the title on air', () => {
      const titled = { ...playing, streamTitle: 'Artist - Song' };
      expect(run({ type: 'RADIO_STREAM_ART', payload: { uuid: 'abc', title: 'Artist - Song', art: 'abcd' } }, titled).streamArt).toBe('abcd');
    });

    it('ignores art that arrives after the song changed', () => {
      const titled = { ...playing, streamTitle: 'Artist - Next' };
      expect(run({ type: 'RADIO_STREAM_ART', payload: { uuid: 'abc', title: 'Artist - Song', art: 'abcd' } }, titled)).toBe(titled);
    });
  });

  describe('playlists', () => {
    it('opens a playlist on its tab', () => {
      expect(run({ type: 'OPEN_PLAYLIST', payload: { id: 3 } })).toMatchObject({ tab: 'playlist', playlistId: 3 });
    });

    it('leaves the tab of a playlist that is deleted', () => {
      const open = run({ type: 'OPEN_PLAYLIST', payload: { id: 3 } });

      expect(run({ type: 'DELETE_PLAYLIST', payload: { id: 3 } }, open)).toMatchObject({ tab: 'home', playlistId: null });
    });

    it('keeps the tab when another playlist is deleted, or when the playlist is not on show', () => {
      const open = run({ type: 'OPEN_PLAYLIST', payload: { id: 3 } });
      const elsewhere = run({ type: 'SET_TAB', payload: { tab: 'settings' } }, open);

      expect(run({ type: 'DELETE_PLAYLIST', payload: { id: 4 } }, open)).toBe(open);
      expect(run({ type: 'DELETE_PLAYLIST', payload: { id: 3 } }, elsewhere)).toMatchObject({ tab: 'settings', playlistId: null });
    });
  });
  describe('sidebar groups', () => {
    it('opens and closes each group on its own', () => {
      const closedLibrary = run({ type: 'SET_NAVIGATION_GROUP', payload: { group: 'library', open: false } });
      const closed = run({ type: 'SET_NAVIGATION_GROUP', payload: { group: 'playlists', open: false } }, closedLibrary);
      const reopened = run({ type: 'SET_NAVIGATION_GROUP', payload: { group: 'library', open: true } }, closed);

      expect(closedLibrary).toMatchObject({ libraryOpen: false, playlistsOpen: true });
      expect(closed).toMatchObject({ libraryOpen: false, playlistsOpen: false });
      expect(reopened).toMatchObject({ libraryOpen: true, playlistsOpen: false });
    });

    it('restores the saved state of the groups', () => {
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { libraryOpen: false, playlistsOpen: false } } })).toMatchObject({
        libraryOpen: false,
        playlistsOpen: false,
      });
    });

    it('starts with both groups open for settings saved before the groups, and for a value that is not valid', () => {
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { view: 'tracks' } } })).toMatchObject({ libraryOpen: true, playlistsOpen: true });
      // only a saved closed group closes it
      expect(run({ type: 'RESTORE_SETTINGS', payload: { settings: { libraryOpen: 'no' as never, playlistsOpen: 0 as never } } })).toMatchObject({
        libraryOpen: true,
        playlistsOpen: true,
      });
    });
  });
});

describe('uiState reducer, the state the views keep while the app is open', () => {
  const selected = (...paths: string[]) => run({ type: 'SELECT_TRACKS', payload: { tracks: paths.map(track) } });

  it('keeps the side and the order of the favourites, starting at the local side and the newest', () => {
    expect(initial).toMatchObject({ favouritesSource: 'local', favouritesOrder: 'recent' });

    const state = run({ type: 'SET_FAVOURITES_ORDER', payload: { order: 'name' } }, run({ type: 'SET_FAVOURITES_SOURCE', payload: { source: 'online' } }));

    expect(state).toMatchObject({ favouritesSource: 'online', favouritesOrder: 'name' });
  });

  it('keeps whether the equalizer shows its faders, hidden at first', () => {
    expect(initial.showFaders).toBe(false);
    expect(run({ type: 'SET_SHOW_FADERS', payload: { show: true } }).showFaders).toBe(true);
  });

  it('keeps the output devices that are there', () => {
    const devices = [{ id: 'a1', label: 'USB DAC' }];

    expect(initial.outputDevices).toEqual([]);
    expect(run({ type: 'OUTPUT_DEVICES_LOADED', payload: { devices } }).outputDevices).toEqual(devices);
  });

  it('selects and unselects a track by its path, and selects a list of them in place of the earlier ones', () => {
    const toggled = run({ type: 'TOGGLE_TRACK_SELECTION', payload: { track: track('/a') } }, selected('/b'));
    expect(Object.keys(toggled.selectedTracks)).toEqual(['/b', '/a']);

    expect(Object.keys(run({ type: 'TOGGLE_TRACK_SELECTION', payload: { track: track('/a') } }, toggled).selectedTracks)).toEqual(['/b']);
    expect(Object.keys(selected('/c', '/d').selectedTracks)).toEqual(['/c', '/d']);
    expect(run({ type: 'CLEAR_TRACK_SELECTION' }, selected('/a')).selectedTracks).toEqual({});
  });

  it.each([
    ['another sort', { type: 'SET_TRACK_SORT', payload: { sort: { field: 'title', direction: 'asc' } } }],
    ['another search', { type: 'SET_LIBRARY_SEARCH', payload: { search: 'blue' } }],
    ['other folders', { type: 'SET_LIBRARY_FOLDERS', payload: { folders: ['/music'] } }],
  ] as [string, AppAction][])('drops the selection with %s, as it is another list', (_name, action) => {
    expect(run(action, selected('/a')).selectedTracks).toEqual({});
  });

  it('keeps the selection when the search is set to what it is', () => {
    const state = run({ type: 'SET_LIBRARY_SEARCH', payload: { search: 'blue' } }, selected('/a'));

    expect(
      Object.keys(run({ type: 'SET_LIBRARY_SEARCH', payload: { search: 'blue' } }, { ...state, selectedTracks: selected('/a').selectedTracks }).selectedTracks)
    ).toEqual(['/a']);
  });

  it('drops the selection with a view change only when that drops a search', () => {
    expect(Object.keys(run({ type: 'SET_VIEW', payload: { view: 'albums' } }, selected('/a')).selectedTracks)).toEqual(['/a']);
    expect(run({ type: 'SET_VIEW', payload: { view: 'albums' } }, { ...selected('/a'), librarySearch: 'blue' }).selectedTracks).toEqual({});
  });

  it('drops the folders the library lost, with the selection', () => {
    const state = { ...selected('/a'), libraryFolders: ['/gone', '/music'] };

    expect(run({ type: 'STORE_FOLDERS', payload: { folders: [{ path: '/music' } as never] } }, state).selectedTracks).toEqual({});
  });

  describe('a folder that is removed from the library', () => {
    const remove = (state: UiState, path = '/music') => run({ type: 'REMOVE_FOLDER', payload: { path } }, state);
    const paths = (tracks: Track[]) => tracks.map(({ path }) => path);
    const queued = (current: string | null, extra: Partial<UiState> = {}): UiState => ({
      ...initial,
      nowPlaying: ['/music/a.flac', '/music2/b.flac', '/other/c.flac'].map(track),
      played: ['/music/old.flac', '/other/old.flac'].map(track),
      playNext: ['/music/a.flac', '/other/c.flac'],
      currentSong: current ? track(current) : null,
      currentTime: 42,
      isPlaying: true,
      ...extra,
    });

    it('drops its tracks from the selection, and only those', () => {
      const state = remove(selected('/music/a.flac', '/music2/b.flac', '/other/c.flac'));

      expect(Object.keys(state.selectedTracks)).toEqual(['/music2/b.flac', '/other/c.flac']);
    });

    it('drops its tracks from the queue, the ones played and the ones put next, and only those', () => {
      const state = remove(queued('/other/c.flac'));

      expect(paths(state.nowPlaying)).toEqual(['/music2/b.flac', '/other/c.flac']);
      expect(paths(state.played)).toEqual(['/other/old.flac']);
      expect(state.playNext).toEqual(['/other/c.flac']);
    });

    it('goes on with a song that is not of the folder', () => {
      const state = remove(queued('/other/c.flac'));

      expect(state).toMatchObject({ currentSong: track('/other/c.flac'), currentTime: 42, isPlaying: true });
    });

    it('stops the song that is of the folder, as it is not there to play', () => {
      const state = remove(queued('/music/a.flac', { streamTitle: 'live', streamArt: 'art' }));

      expect(state).toMatchObject({ currentSong: null, currentTime: 0, isPlaying: false, streamTitle: null, streamArt: null });
      expect(paths(state.nowPlaying)).toEqual(['/music2/b.flac', '/other/c.flac']);
    });

    it('keeps the radio station that plays, which no folder has', () => {
      const station = track('radio:abc');

      expect(remove({ ...queued(null), nowPlaying: [station], currentSong: station }).currentSong).toEqual(station);
    });

    it('takes the tracks of the folder as they are stored, with forward slashes, when it was picked with backslashes or a slash at its end', () => {
      expect(paths(remove(queued(null), String.raw`\music`).nowPlaying)).toEqual(['/music2/b.flac', '/other/c.flac']);
      expect(paths(remove(queued(null), '/music/').nowPlaying)).toEqual(['/music2/b.flac', '/other/c.flac']);
      expect(paths(remove({ ...queued(null), nowPlaying: [track('C:/Music/a.flac'), track('C:/Music2/b.flac')] }, String.raw`C:\Music`).nowPlaying)).toEqual([
        'C:/Music2/b.flac',
      ]);
    });
  });
});
