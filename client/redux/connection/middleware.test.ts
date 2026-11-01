import { describe, expect, it, vi } from 'vitest';
import { applyMiddleware, createStore } from 'redux';

const setup = async (
  fetchImpl: (url: string) => Promise<unknown> = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) })
) => {
  const send = vi.fn();
  const on = vi.fn();
  vi.resetModules();
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  window.electronAPI = { send, on, getPathForFile: () => '', blurred: false };

  const { default: reducers } = await import('../reducers');
  const { default: middleware } = await import('./middleware');
  const store = createStore(reducers, applyMiddleware(middleware));

  const listen = (channel: string, payload: unknown) => on.mock.calls.find(([name]) => name === channel)?.[1](payload);

  return { store, send, listen, fetchMock };
};

describe('connection middleware', () => {
  it('asks the main process for the state when it starts', async () => {
    const { send } = await setup();

    expect(send).toHaveBeenCalledWith('APP_READY', 'Ready to receive');
  });

  it('stores the launcher state the main process reports', async () => {
    const { store, listen } = await setup();

    listen('LAUNCHER_STATE', { available: true, enabled: true, offered: true });

    expect(store.getState().uiState.launcher).toEqual({ available: true, enabled: true, offered: true });
  });

  it('sends the request to add or remove the launcher to the main process', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'SET_LAUNCHER', payload: { enabled: true } });

    expect(send).toHaveBeenCalledWith('SET_LAUNCHER', { enabled: true });
  });

  it('saves the picked language with the settings, so the main process follows it', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'SET_LANGUAGE', payload: { language: 'hu' } });

    expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ language: 'hu' }));
  });

  it('saves the picked mode at once with the settings, so the main process matches its native parts to it', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'SET_THEME_MODE', payload: { mode: 'light' } });

    expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ theme: { mode: 'light', accent: 'auto' } }));
  });

  it('saves the accent once the colour input stops changing, with the last colour', async () => {
    vi.useFakeTimers();
    try {
      const { store, send } = await setup();

      store.dispatch({ type: 'SET_ACCENT', payload: { accent: '#111111' } });
      store.dispatch({ type: 'SET_ACCENT', payload: { accent: '#222222' } });
      expect(send).not.toHaveBeenCalledWith('SAVE_SETTINGS', expect.anything());

      vi.advanceTimersByTime(500);

      expect(send.mock.calls.filter(([channel]) => channel === 'SAVE_SETTINGS')).toEqual([
        ['SAVE_SETTINGS', expect.objectContaining({ theme: { mode: 'system', accent: '#222222' } })],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves the open and closed groups of the sidebar once they stop changing', async () => {
    vi.useFakeTimers();
    try {
      const { store, send } = await setup();

      store.dispatch({ type: 'SET_NAVIGATION_GROUP', payload: { group: 'library', open: true } });
      store.dispatch({ type: 'SET_NAVIGATION_GROUP', payload: { group: 'playlists', open: false } });
      vi.advanceTimersByTime(500);

      expect(send.mock.calls.filter(([channel]) => channel === 'SAVE_SETTINGS')).toEqual([
        ['SAVE_SETTINGS', expect.objectContaining({ libraryOpen: true, playlistsOpen: false })],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks the main process for the version when it starts and stores the update state it reports', async () => {
    const { store, send, listen } = await setup();
    const state = { version: '26.10.5', electron: '40.0.0', chrome: '140.0.0', unavailable: undefined, automatic: true, status: { kind: 'checking' } };

    listen('UPDATE_STATE', state);

    expect(send).toHaveBeenCalledWith('GET_APP_VERSION');
    expect(store.getState().update).toEqual(state);
  });

  it('sends the request to check for updates and to open the releases to the main process', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'CHECK_FOR_UPDATES' });
    store.dispatch({ type: 'OPEN_RELEASES' });

    expect(send).toHaveBeenCalledWith('CHECK_FOR_UPDATES');
    expect(send).toHaveBeenCalledWith('OPEN_RELEASES');
  });

  it('sends the choice to update at start to the main process', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'SET_AUTOMATIC_UPDATES', payload: { enabled: false } });

    expect(send).toHaveBeenCalledWith('SET_AUTOMATIC_UPDATES', { enabled: false });
  });

  it('saves the queue and the position before the restart for an update', async () => {
    const { store, send } = await setup();
    const track = { path: '/a.flac', title: 'A', artist: '', album: '', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 };
    store.dispatch({ type: 'PLAY_TRACKS', payload: { tracks: [track] } });
    store.dispatch({ type: 'SET_CURRENT_TIME', payload: { currentTime: 42 } });
    send.mockClear();

    store.dispatch({ type: 'INSTALL_UPDATE' });

    expect(send.mock.calls.map(([channel]) => channel)).toEqual(['SAVE_SETTINGS', 'INSTALL_UPDATE']);
    expect(send.mock.calls[0][1]).toMatchObject({ nowPlaying: [track], currentTime: 42 });
  });

  describe('favourites', () => {
    const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
    const favourite = { source: 'radio', kind: 'station', id: 'abc', snapshot: station, addedAt: 1, available: true };

    it('asks the main process for the favourites when it starts and when the library changed', async () => {
      const { store, send, listen } = await setup();
      expect(send).toHaveBeenCalledWith('FAVOURITES_LOAD');
      send.mockClear();

      listen('RESCAN_COMPLETE', {});

      expect(send).toHaveBeenCalledWith('FAVOURITES_LOAD');
      expect(store.getState().favourites).toEqual([]);
    });

    it('stores the favourites of the sources it knows and leaves out the others', async () => {
      const { store, listen } = await setup();

      listen('FAVOURITES', { favourites: [favourite, { ...favourite, source: 'drive:usb' }, 'broken'] });

      expect(store.getState().favourites).toEqual([favourite]);
    });

    it('sends the added and the removed favourite to the main process', async () => {
      const { store, send } = await setup();
      const item = { source: 'radio', kind: 'station', id: 'abc', snapshot: station } as const;

      store.dispatch({ type: 'ADD_FAVOURITE', payload: { favourite: item } });
      store.dispatch({ type: 'REMOVE_FAVOURITE', payload: { key: { source: 'radio', kind: 'station', id: 'abc' } } });

      expect(send).toHaveBeenCalledWith('FAVOURITE_ADD', item);
      expect(send).toHaveBeenCalledWith('FAVOURITE_REMOVE', { source: 'radio', kind: 'station', id: 'abc' });
      expect(store.getState().favourites).toEqual([]);
    });
  });

  describe('history', () => {
    const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
    const track = { path: '/a.flac', title: 'A', artist: '', album: '', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 };
    const item = { source: 'radio', kind: 'station', id: 'abc', snapshot: station, playedAt: 1, available: true };

    it('asks the main process for the history when it starts and when the library changed', async () => {
      const { send, listen } = await setup();
      expect(send).toHaveBeenCalledWith('HISTORY_LOAD');
      send.mockClear();

      listen('RESCAN_COMPLETE', {});

      expect(send).toHaveBeenCalledWith('HISTORY_LOAD');
    });

    it('stores the history of the sources it knows and leaves out the others', async () => {
      const { store, listen } = await setup();

      listen('HISTORY', { history: [item, { ...item, source: 'drive:usb' }, 'broken'] });

      expect(store.getState().history).toEqual([item]);
    });

    it('records a track of the library when it starts playing', async () => {
      const { store, send } = await setup();
      vi.stubGlobal('Notification', vi.fn());

      store.dispatch({ type: 'PLAY_TRACK', payload: { track } });

      expect(send).toHaveBeenCalledWith('HISTORY_RECORD', { source: 'local', kind: 'track', id: '/a.flac', snapshot: track });
    });

    it('records the station a radio track plays, not the track', async () => {
      const { store, send } = await setup();

      store.dispatch({ type: 'PLAY_RADIO_STATION', payload: { station } });

      expect(send).toHaveBeenCalledWith('HISTORY_RECORD', { source: 'radio', kind: 'station', id: 'abc', snapshot: station });
    });

    it('records nothing when playback is cleared', async () => {
      const { store, send } = await setup();
      send.mockClear();

      store.dispatch({ type: 'PLAY_TRACK', payload: { track: null } });

      expect(send).not.toHaveBeenCalledWith('HISTORY_RECORD', expect.anything());
    });

    it('clears the history in the store and in the main process', async () => {
      const { store, send, listen } = await setup();
      listen('HISTORY', { history: [item] });

      store.dispatch({ type: 'CLEAR_HISTORY' });

      expect(send).toHaveBeenCalledWith('HISTORY_CLEAR');
      expect(store.getState().history).toEqual([]);
    });
  });

  it('logs a page that could not be fetched, and asks for it again on the next request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, fetchMock } = await setup(() => Promise.reject(new Error('no server')));

    store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'tracks', page: 0 } });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'no server' })));
    const failed = fetchMock.mock.calls.length;
    store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'tracks', page: 0 } });

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(failed));
  });

  describe('the sort and the folders of the library', () => {
    const emptyPage = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) });
    const requested = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url]) => String(url));
    const folder = (path: string) => ({ path, lastModified: 1 });

    it('saves the sort and the selected folders with the settings', async () => {
      const { store, send } = await setup();

      store.dispatch({ type: 'SET_TRACK_SORT', payload: { sort: { field: 'year', direction: 'desc' } } });
      store.dispatch({ type: 'SET_ALBUM_SORT', payload: { sort: { field: 'title', direction: 'asc' } } });
      store.dispatch({ type: 'SET_LIBRARY_FOLDERS', payload: { folders: ['/m'] } });
      store.dispatch({ type: 'SET_COVER_SIZE', payload: { size: 200 } });
      store.dispatch({ type: 'SAVE_SETTINGS', payload: {} });

      expect(send).toHaveBeenLastCalledWith(
        'SAVE_SETTINGS',
        expect.objectContaining({
          trackSort: { field: 'year', direction: 'desc' },
          albumSort: { field: 'title', direction: 'asc' },
          coverSize: 200,
          libraryFolders: ['/m'],
        })
      );
    });

    it('drops the pages of the list whose sort changed, and fetches the first page sorted', async () => {
      const { store, fetchMock } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });
      store.dispatch({ type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [], total: 5 } });

      store.dispatch({ type: 'SET_TRACK_SORT', payload: { sort: { field: 'title', direction: 'desc' } } });

      expect(store.getState().library.tracks).toEqual({ total: undefined, pages: {}, stale: [] });
      expect(store.getState().library.albums.total).toBe(5);
      store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'tracks', page: 0 } });
      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/tracks?offset=0&limit=100&sort=title&dir=desc'));
    });

    it('drops the pages of both lists when the search changes, and fetches the first page of the search', async () => {
      const { store, fetchMock } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });
      store.dispatch({ type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [], total: 5 } });

      store.dispatch({ type: 'SET_LIBRARY_SEARCH', payload: { search: ' halo ' } });

      expect(store.getState().library.tracks.total).toBeUndefined();
      expect(store.getState().library.albums.total).toBeUndefined();
      store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'albums', page: 0 } });
      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/albums?offset=0&limit=100&search=halo'));
    });

    it('keeps the pages when the search only gains space around it', async () => {
      const { store } = await setup(emptyPage);
      store.dispatch({ type: 'SET_LIBRARY_SEARCH', payload: { search: 'halo' } });
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });

      store.dispatch({ type: 'SET_LIBRARY_SEARCH', payload: { search: 'halo ' } });

      expect(store.getState().library.tracks.total).toBe(500);
    });

    it('drops the albums when their sort changes, and not the tracks', async () => {
      const { store } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });
      store.dispatch({ type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [], total: 5 } });

      store.dispatch({ type: 'SET_ALBUM_SORT', payload: { sort: { field: 'year', direction: 'asc' } } });

      expect(store.getState().library.albums.total).toBeUndefined();
      expect(store.getState().library.tracks.total).toBe(500);
    });

    it('keeps the pages when the sort is set to what it was', async () => {
      const { store } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });

      store.dispatch({ type: 'SET_TRACK_SORT', payload: { sort: undefined } });

      expect(store.getState().library.tracks.total).toBe(500);
    });

    it('does not store a page that was asked for before the sort changed, and asks for it again with the new sort', async () => {
      const resolvers: (() => void)[] = [];
      const { store, fetchMock } = await setup(
        () =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 7 }) }));
          })
      );
      await vi.waitFor(() => expect(resolvers).toHaveLength(1));

      store.dispatch({ type: 'SET_TRACK_SORT', payload: { sort: { field: 'artist', direction: 'asc' } } });
      resolvers[0]();

      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/tracks?offset=0&limit=100&sort=artist&dir=asc'));
      expect(store.getState().library.tracks.total).toBeUndefined();
    });

    it('drops the artists, album artists and genres when their sort or filter changes, and not the albums', async () => {
      const { store, fetchMock } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_ALBUM_PAGE', payload: { page: 0, items: [], total: 5 } });
      store.dispatch({ type: 'STORE_GROUP_PAGE', payload: { kind: 'artist', page: 0, items: [], total: 9 } });

      store.dispatch({ type: 'SET_GROUP_FILTER', payload: { filter: 'bj' } });

      expect(store.getState().library.groups.artist.total).toBeUndefined();
      expect(store.getState().library.albums.total).toBe(5);
      store.dispatch({ type: 'SET_GROUP_SORT', payload: { sort: { field: 'trackCount', direction: 'desc' } } });
      store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'genre', page: 0 } });
      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/groups?offset=0&limit=100&by=genre&sort=trackCount&dir=desc&q=bj'));
    });

    it('fetches the albums of the open group, and drops them when another group is opened', async () => {
      const { store, fetchMock } = await setup(emptyPage);

      store.dispatch({ type: 'OPEN_GROUP', payload: { group: { kind: 'artist', key: 'adam', name: 'Adam' } } });
      store.dispatch({ type: 'STORE_GROUP_ALBUM_PAGE', payload: { page: 0, items: [], total: 3 } });
      store.dispatch({ type: 'OPEN_GROUP', payload: { group: { kind: 'artist', key: 'bea', name: 'Bea' } } });

      expect(store.getState().library.groupAlbums.total).toBeUndefined();
      store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'groupAlbums', page: 0 } });
      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/albums?offset=0&limit=100&by=artist&group=bea'));
      expect(store.getState().library.albums.total).toBeUndefined();
    });

    describe('the photos of the artists', () => {
      const adam = { key: 'adam', name: 'Adam', albumCount: 1, trackCount: 1, cover: null, covers: [] };
      const nameless = { ...adam, key: '', name: '' };
      const page = (kind: 'artist' | 'albumArtist' | 'genre', items = [adam, nameless]) =>
        ({ type: 'STORE_GROUP_PAGE', payload: { kind, page: 0, items, total: items.length } }) as const;

      it('asks for the photos of the names of a page of artists or album artists, not for the ones without a name', async () => {
        const { store, send } = await setup();

        store.dispatch(page('artist'));
        store.dispatch(page('albumArtist'));

        expect(send.mock.calls.filter(([channel]) => channel === 'ARTIST_PHOTOS_WANTED')).toEqual([
          ['ARTIST_PHOTOS_WANTED', { artists: [{ key: 'adam', name: 'Adam' }] }],
          ['ARTIST_PHOTOS_WANTED', { artists: [{ key: 'adam', name: 'Adam' }] }],
        ]);
      });

      it('asks for nothing for genres, for a page without names, or when it is turned off', async () => {
        const { store, send } = await setup();

        store.dispatch(page('genre'));
        store.dispatch(page('artist', [nameless]));
        store.dispatch({ type: 'SET_ARTIST_PHOTOS', payload: { enabled: false } });
        store.dispatch(page('artist'));

        expect(send).not.toHaveBeenCalledWith('ARTIST_PHOTOS_WANTED', expect.anything());
      });

      it('saves the setting, and asks for the photos of the names that are shown when it is turned on', async () => {
        const { store, send } = await setup();
        store.dispatch({ type: 'SET_ARTIST_PHOTOS', payload: { enabled: false } });
        store.dispatch(page('artist'));

        store.dispatch({ type: 'SET_ARTIST_PHOTOS', payload: { enabled: true } });

        expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ artistPhotos: false }));
        expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ artistPhotos: true }));
        expect(send).toHaveBeenLastCalledWith('ARTIST_PHOTOS_WANTED', { artists: [{ key: 'adam', name: 'Adam' }] });
      });

      it('saves the setting that turns the watching of the library folders off', async () => {
        const { store, send } = await setup();

        store.dispatch({ type: 'SET_WATCH_FOLDERS', payload: { enabled: false } });

        expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ watchFolders: false }));
      });

      it('fetches the covers again when the main process has stored photos', async () => {
        const { store, listen } = await setup();
        store.dispatch(page('artist'));

        listen('ARTIST_PHOTOS_READY', {});

        expect(store.getState().library.groups.artist.stale).toEqual([0]);
      });
    });

    it('saves the sort of the groups with the settings', async () => {
      const { store, send } = await setup();

      store.dispatch({ type: 'SET_GROUP_SORT', payload: { sort: { field: 'name', direction: 'desc' } } });
      store.dispatch({ type: 'SAVE_SETTINGS', payload: {} });

      expect(send).toHaveBeenLastCalledWith('SAVE_SETTINGS', expect.objectContaining({ groupSort: { field: 'name', direction: 'desc' } }));
    });

    it('searches the radio with the saved filters when the settings arrive', async () => {
      const { store, send, listen } = await setup();

      listen('RESTORE_SETTINGS', { settings: { radioQuery: { tag: 'jazz', country: 'Hungary' } } });

      expect(send).toHaveBeenCalledWith('RADIO_SEARCH', { tag: 'jazz', country: 'Hungary' });
      expect(store.getState().radio).toMatchObject({ query: { tag: 'jazz', country: 'Hungary' }, loading: true });
    });

    it('does not search the radio when the settings have no filters saved', async () => {
      const { send, listen } = await setup();

      listen('RESTORE_SETTINGS', { settings: { coverSize: 150 } });

      expect(send).not.toHaveBeenCalledWith('RADIO_SEARCH', expect.anything());
    });

    it('limits the lists to the selected folders the library has, and ignores a stale one', async () => {
      const { store, listen, fetchMock } = await setup(emptyPage);
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 500 } });
      store.dispatch({ type: 'RESTORE_SETTINGS', payload: { settings: { libraryFolders: ['/m/a', '/gone'] } } });

      // the folders arrive after the settings, and the selection is only of the folder that exists
      listen('STORE_FOLDERS', { folders: [folder('/m/a'), folder('/m/b')] });
      expect(store.getState().library.tracks.total).toBeUndefined();
      expect(store.getState().uiState.libraryFolders).toEqual(['/m/a']);
      store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'albums', page: 0 } });

      await vi.waitFor(() => expect(requested(fetchMock)).toContain('tunelle://app/library/albums?offset=0&limit=100&folder=%2Fm%2Fa'));
    });

    it('shows everything again when the only selected folder leaves the library', async () => {
      const { store, listen } = await setup(emptyPage);
      listen('STORE_FOLDERS', { folders: [folder('/m/a'), folder('/m/b')] });
      store.dispatch({ type: 'SET_LIBRARY_FOLDERS', payload: { folders: ['/m/a'] } });
      store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: [], total: 2 } });

      listen('STORE_FOLDERS', { folders: [folder('/m/b')] });

      expect(store.getState().uiState.libraryFolders).toEqual([]);
      expect(store.getState().library.tracks.total).toBeUndefined();
    });
  });

  it('stores the playlists the main process reports and leaves out the tracks it cannot show', async () => {
    const { store, listen } = await setup();
    const track = { path: '/a.flac', title: 'A' };

    listen('PLAYLISTS', {
      playlists: [
        {
          id: 1,
          name: 'Road',
          entries: [
            { id: 1, track, available: true },
            { id: 2, track: 5, available: true },
          ],
        },
      ],
    });

    expect(store.getState().playlists).toEqual([{ id: 1, name: 'Road', entries: [{ id: 1, track, available: true }] }]);
  });

  it('asks for the playlists when it starts and sends every change to the main process', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'CREATE_PLAYLIST', payload: { name: 'Road' } });
    store.dispatch({ type: 'RENAME_PLAYLIST', payload: { id: 1, name: 'Night' } });
    store.dispatch({ type: 'MOVE_PLAYLIST', payload: { id: 1, toIndex: 0 } });
    store.dispatch({ type: 'ADD_TO_PLAYLIST', payload: { id: 1, tracks: [] } });
    store.dispatch({ type: 'MOVE_PLAYLIST_ENTRY', payload: { id: 1, entryId: 2, toIndex: 0 } });
    store.dispatch({ type: 'REMOVE_FROM_PLAYLIST', payload: { id: 1, entryId: 2 } });
    store.dispatch({ type: 'DELETE_PLAYLIST', payload: { id: 1 } });

    expect(send.mock.calls.map(([channel]) => channel).filter((channel) => channel.startsWith('PLAYLIST'))).toEqual([
      'PLAYLISTS_LOAD',
      'PLAYLIST_CREATE',
      'PLAYLIST_RENAME',
      'PLAYLIST_MOVE',
      'PLAYLIST_ADD',
      'PLAYLIST_MOVE_ENTRY',
      'PLAYLIST_REMOVE_ENTRY',
      'PLAYLIST_DELETE',
    ]);
  });
});
