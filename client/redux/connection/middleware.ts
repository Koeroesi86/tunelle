import type { Middleware } from 'redux';
import type { Folder, Track } from '../../../types/library';
import type { RadioOption, RadioOptionKind, RadioQuery, RadioStation, RadioTag } from '../../../types/radio';
import type { GroupSummary } from '../../../types/library';
import type { GroupKind } from '../../../types/library-query';
import { parseRadioQuery } from '../../../types/radio-query';
import type { UpdateState } from '../../../types/update';
import { electronAPI } from '../../electron-api';
import { debounce } from '../../utils/debounce';
import type { RootState } from '../reducers';
import toAddedFiles from '../../added-files';
import { getCoverUrl } from '../../cover-url';
import { isFavourite, stationFavourite, trackFavourite } from '../../favourites';
import { isHistoryItem } from '../../history';
import { toPlaylist } from '../../playlists';
import { radioUuidOf } from '../../radio-track';
import { fetchAlbumPage, fetchGroupPage, fetchTrackPage } from '../../library-api';
import { selectAlbumQuery, selectGroupAlbumQuery, selectGroupQuery, selectTrackQuery } from '../../library-query';
import { actionMiddleware, onAction } from '../on-action';
import type { Store } from '../on-action';
import type { PageKind, PersistedSettings, PlaylistItem, UiState } from '../types';

type EmptyPayload = Record<string, never>;

function addListeners(store: Store) {
  electronAPI.on<{ folders: Folder[] }>('STORE_FOLDERS', (payload) => store.dispatch({ type: 'STORE_FOLDERS', payload }));
  electronAPI.on<{ folders: string[] }>('OFFLINE_FOLDERS', (payload) => store.dispatch({ type: 'OFFLINE_FOLDERS', payload }));
  electronAPI.on<EmptyPayload>('RESCAN_COMPLETE', (payload) => store.dispatch({ type: 'RESCAN_COMPLETE', payload }));
  electronAPI.on<{ folders: Folder[] }>('FOLDERS_ADDED_TO_LIBRARY', (payload) => store.dispatch({ type: 'FOLDERS_ADDED_TO_LIBRARY', payload }));
  electronAPI.on<EmptyPayload>('FOLDER_REMOVED_FROM_LIBRARY', (payload) => store.dispatch({ type: 'FOLDER_REMOVED_FROM_LIBRARY', payload }));
  electronAPI.on<EmptyPayload>('ARTIST_PHOTOS_READY', (payload) => store.dispatch({ type: 'ARTIST_PHOTOS_READY', payload }));
  electronAPI.on<EmptyPayload>('TRACKS_ADDED_TO_LIBRARY', (payload) => store.dispatch({ type: 'TRACKS_ADDED_TO_LIBRARY', payload }));
  electronAPI.on<{ maximized: boolean }>('MAXIMIZED_APP', (payload) => store.dispatch({ type: 'MAXIMIZED_APP', payload }));
  electronAPI.on<{ playlist: PlaylistItem[]; url: string }>('CLICKED_URL', (payload) => store.dispatch({ type: 'CLICKED_URL', payload }));
  electronAPI.on<{ isPlaying: boolean }>('SET_PLAYING', (payload) => store.dispatch({ type: 'SET_PLAYING', payload }));
  electronAPI.on<{ available: boolean; enabled: boolean; offered: boolean }>('LAUNCHER_STATE', (payload) =>
    store.dispatch({ type: 'LAUNCHER_STATE', payload })
  );
  electronAPI.on<UpdateState>('UPDATE_STATE', (payload) => store.dispatch({ type: 'UPDATE_STATE', payload }));
  electronAPI.on<{ settings: Partial<PersistedSettings> }>('RESTORE_SETTINGS', (payload) => {
    store.dispatch({ type: 'RESTORE_SETTINGS', payload });
    // the list that opened before the settings arrived was asked for without the saved filters, and its answer is dropped
    if ('radioQuery' in payload.settings) store.dispatch({ type: 'SEARCH_RADIO', payload: { query: parseRadioQuery(payload.settings.radioQuery) } });
  });
  electronAPI.on<{ fileName: string; progress: number; totalCount: number }>('SCANNING_FILE', (payload) => store.dispatch({ type: 'SCANNING_FILE', payload }));
  electronAPI.on<{ query: RadioQuery; stations: RadioStation[]; hasMore?: boolean; error?: string }>('RADIO_STATIONS', (payload) =>
    store.dispatch({ type: 'RADIO_STATIONS', payload })
  );
  electronAPI.on<{ tags: RadioTag[] }>('RADIO_TAGS_LOADED', (payload) => store.dispatch({ type: 'RADIO_TAGS_LOADED', payload }));
  electronAPI.on<{ kind: RadioOptionKind; options: RadioOption[] }>('RADIO_OPTIONS_LOADED', (payload) =>
    store.dispatch({ type: 'RADIO_OPTIONS_LOADED', payload })
  );
  electronAPI.on<{ uuid: string; title: string }>('RADIO_STREAM_TITLE', (payload) => store.dispatch({ type: 'RADIO_STREAM_TITLE', payload }));
  electronAPI.on<{ uuid: string; title: string; art: string }>('RADIO_STREAM_ART', (payload) => store.dispatch({ type: 'RADIO_STREAM_ART', payload }));
  // a favourite of a source this version does not know is left out
  electronAPI.on<{ favourites: unknown[] }>('FAVOURITES', ({ favourites }) =>
    store.dispatch({ type: 'FAVOURITES_LOADED', payload: { favourites: favourites.filter(isFavourite) } })
  );
  electronAPI.on<{ history: unknown[] }>('HISTORY', ({ history }) =>
    store.dispatch({ type: 'HISTORY_LOADED', payload: { history: history.filter(isHistoryItem) } })
  );
  // a track the player cannot show (saved by a newer version) is left out of its playlist
  electronAPI.on<{ playlists: unknown[] }>('PLAYLISTS', ({ playlists }) =>
    store.dispatch({ type: 'PLAYLISTS_LOADED', payload: { playlists: playlists.flatMap(toPlaylist) } })
  );
  electronAPI.on<{ folder: string }>('SCANNING_FOLDER', (payload) => store.dispatch({ type: 'SCANNING_FOLDER', payload }));
}

function rescanLibrary(forced = false) {
  electronAPI.send('RESCAN_LIBRARY', { forced });
}

const appLoaded = debounce(() => {
  electronAPI.send('APP_LOADED', {});
}, 500);

const groupFetcher = (kind: GroupKind) => (state: RootState, page: number) =>
  fetchGroupPage(kind, page, selectGroupQuery(state)).then((result) => ({
    type: 'STORE_GROUP_PAGE' as const,
    payload: { kind, page, ...result },
  }));

const pageFetchers = {
  tracks: ({ uiState, folders }: RootState, page: number) =>
    fetchTrackPage(page, selectTrackQuery({ uiState, folders })).then((result) => ({
      type: 'STORE_TRACK_PAGE' as const,
      payload: { page, ...result },
    })),
  albums: ({ uiState, folders }: RootState, page: number) =>
    fetchAlbumPage(page, selectAlbumQuery({ uiState, folders })).then((result) => ({
      type: 'STORE_ALBUM_PAGE' as const,
      payload: { page, ...result },
    })),
  groupAlbums: ({ uiState, folders }: RootState, page: number) =>
    fetchAlbumPage(page, selectGroupAlbumQuery({ uiState, folders })).then((result) => ({
      type: 'STORE_GROUP_ALBUM_PAGE' as const,
      payload: { page, ...result },
    })),
  artist: groupFetcher('artist'),
  albumArtist: groupFetcher('albumArtist'),
  genre: groupFetcher('genre'),
} satisfies Record<PageKind, unknown>;

const loading = new Set<string>();
let generation = 0;

/** Fetch a page once at a time; a page that was requested before the library changed is fetched again instead of stored */
const loadPage = (store: Store, kind: PageKind, page: number): Promise<void> => {
  const key = `${kind}:${page}`;
  if (loading.has(key)) return Promise.resolve();

  loading.add(key);
  const requested = generation;
  return pageFetchers[kind](store.getState(), page)
    .then((action) => {
      loading.delete(key);
      if (requested === generation) store.dispatch(action);
      else store.dispatch({ type: 'LOAD_LIBRARY_PAGE', payload: { kind, page } });
    })
    .catch((err) => {
      loading.delete(key);
      console.error(err);
    });
};

/** The artists and album artists that have their photos looked up; the main process knows which names it has an answer for */
const photoKinds: GroupKind[] = ['artist', 'albumArtist'];

const requestPhotos = (groups: GroupSummary[]) => {
  const artists = groups.filter(({ name }) => name).map(({ key, name }) => ({ key, name }));
  if (artists.length > 0) electronAPI.send('ARTIST_PHOTOS_WANTED', { artists });
};

const rescanInterval = 1000 * 60 * 60;
// a drive that is not there is looked for again at this pace, besides every time the window gets the focus
const offlineRecheckInterval = 1000 * 30;

const persistedKeys = [
  'view',
  'onlineView',
  'libraryOpen',
  'playlistsOpen',
  'nowPlaying',
  'played',
  'currentSong',
  'currentTime',
  'volume',
  'normalization',
  'selectedAlbum',
  'maximized',
  'shuffle',
  'repeat',
  'equalizer',
  'desktopBlur',
  'language',
  'theme',
  'trackSort',
  'albumSort',
  'coverSize',
  'groupSort',
  'artistPhotos',
  'watchFolders',
  'libraryFolders',
  'radioQuery',
] satisfies (keyof PersistedSettings)[];

const saveSettings = (uiState: UiState) => electronAPI.send('SAVE_SETTINGS', Object.fromEntries(persistedKeys.map((key) => [key, uiState[key]])));

/** The state is saved a moment after the last change, as the handlers run before the reducer */
const saveLater = debounce((store: Store) => saveSettings(store.getState().uiState), 500);

const toPlaylistTrack = ({ file, title }: PlaylistItem): Track => ({
  path: file,
  title: title ?? '',
  artist: '',
  album: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 0,
});

const notifyPlaying = (track: Track, onClick: () => void) => {
  const notification: NotificationOptions & { image?: string } = {
    body: `${track.artist}\n${track.album}`,
    silent: false,
  };
  if (track.picture) {
    const url = getCoverUrl(track.picture);
    notification.icon = url;
    notification.image = url;
  }
  new window.Notification(track.title, notification).onclick = onClick;
};

const start = (store: Store) => {
  addListeners(store);
  electronAPI.send('APP_READY', 'Ready to receive');
  electronAPI.send('GET_APP_VERSION');
  electronAPI.send('FAVOURITES_LOAD');
  electronAPI.send('HISTORY_LOAD');
  electronAPI.send('PLAYLISTS_LOAD');

  setInterval(() => {
    if (store.getState().uiState.totalCount === 0) rescanLibrary(false);
  }, rescanInterval);

  electronAPI.send('CHECK_FOLDERS');
  window.addEventListener('focus', () => electronAPI.send('CHECK_FOLDERS'));
  setInterval(() => {
    if (store.getState().offlineFolders.length > 0) electronAPI.send('CHECK_FOLDERS');
  }, offlineRecheckInterval);

  loadPage(store, 'tracks', 0).then(appLoaded);
};

const notifyTrack = (store: Store, track: Track) =>
  notifyPlaying(track, () => {
    store.dispatch({ type: 'CLICK_NOTIFICATION', payload: {} });
    electronAPI.send('NOTIFICATION_CLICKED', { track });
  });

const handleActions = actionMiddleware((store) => [
  onAction('FILES_ADDED', ({ payload }) => electronAPI.send('ADD_FOLDERS_TO_LIBRARY', toAddedFiles(Array.from(payload.fileList), electronAPI.getPathForFile))),
  onAction('PICK_FOLDERS', () => electronAPI.send('PICK_FOLDERS')),
  onAction('REMOVE_FOLDER', ({ payload }) => electronAPI.send('REMOVE_FOLDER_FROM_LIBRARY', payload.path)),
  onAction('RESCAN_LIBRARY', () => rescanLibrary(true)),
  // a page of names that arrives asks for their photos, unless that is turned off
  onAction('STORE_GROUP_PAGE', ({ payload }) => {
    if (store.getState().uiState.artistPhotos && photoKinds.includes(payload.kind)) requestPhotos(payload.items);
  }),
  // turned on, the names that are shown already have their photos looked up
  onAction('SET_ARTIST_PHOTOS', ({ payload }) => {
    const { uiState, library } = store.getState();
    saveSettings({ ...uiState, artistPhotos: payload.enabled });
    if (!payload.enabled) return;

    photoKinds.forEach((kind) => Object.values(library.groups[kind].pages).forEach(requestPhotos));
  }),
  onAction('SET_WATCH_FOLDERS', ({ payload }) => saveSettings({ ...store.getState().uiState, watchFolders: payload.enabled })),
  onAction('LOAD_LIBRARY_PAGE', ({ payload }) => void loadPage(store, payload.kind, payload.page)),
  // the cached pages are fetched again when they are shown, not all at once
  ...(['RESCAN_COMPLETE', 'TRACKS_ADDED_TO_LIBRARY', 'FOLDER_REMOVED_FROM_LIBRARY'] as const).map((type) =>
    onAction(type, () => {
      generation += 1;
      store.dispatch({ type: 'INVALIDATE_LIBRARY' });
      // what the library has decides which local favourites are available
      store.dispatch({ type: 'LOAD_FAVOURITES' });
      store.dispatch({ type: 'LOAD_HISTORY' });
      store.dispatch({ type: 'LOAD_PLAYLISTS' });
    })
  ),
  onAction('CLOSE_APP', () => {
    store.dispatch({ type: 'SAVE_SETTINGS', payload: {} });
    electronAPI.send('CLOSE_APP', {});
  }),
  ...(['MINIMIZE_APP', 'MAXIMIZE_APP'] as const).map((type) => onAction(type, () => electronAPI.send(type, {}))),
  onAction('CLICKED_URL', ({ payload }) => store.dispatch({ type: 'PLAY_TRACKS', payload: { tracks: payload.playlist.map(toPlaylistTrack) } })),
  onAction('PLAY_TRACK', ({ payload }) => {
    if (!payload.track) return;

    notifyTrack(store, payload.track);
    // a station is recorded with all that is known of it when it is picked, the track of the radio knows its name only
    if (!radioUuidOf(payload.track.path)) electronAPI.send('HISTORY_RECORD', trackFavourite(payload.track));
  }),
  onAction('PLAY_RADIO_STATION', ({ payload }) => electronAPI.send('HISTORY_RECORD', stationFavourite(payload.station))),
  onAction('LOAD_FAVOURITES', () => electronAPI.send('FAVOURITES_LOAD')),
  onAction('LOAD_HISTORY', () => electronAPI.send('HISTORY_LOAD')),
  onAction('LOAD_PLAYLISTS', () => electronAPI.send('PLAYLISTS_LOAD')),
  onAction('CREATE_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_CREATE', payload)),
  onAction('RENAME_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_RENAME', payload)),
  onAction('DELETE_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_DELETE', payload)),
  onAction('MOVE_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_MOVE', payload)),
  onAction('ADD_TO_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_ADD', payload)),
  onAction('REMOVE_FROM_PLAYLIST', ({ payload }) => electronAPI.send('PLAYLIST_REMOVE_ENTRY', payload)),
  onAction('MOVE_PLAYLIST_ENTRY', ({ payload }) => electronAPI.send('PLAYLIST_MOVE_ENTRY', payload)),
  onAction('CLEAR_HISTORY', () => electronAPI.send('HISTORY_CLEAR')),
  onAction('ADD_FAVOURITE', ({ payload }) => electronAPI.send('FAVOURITE_ADD', payload.favourite)),
  onAction('REMOVE_FAVOURITE', ({ payload }) => electronAPI.send('FAVOURITE_REMOVE', payload.key)),
  onAction('SEARCH_RADIO', ({ payload }) => electronAPI.send('RADIO_SEARCH', payload.query)),
  onAction('LOAD_RADIO_TAGS', () => electronAPI.send('RADIO_TAGS')),
  onAction('LOAD_RADIO_OPTIONS', () => electronAPI.send('RADIO_OPTIONS')),
  onAction('CHECK_FOR_UPDATES', () => electronAPI.send('CHECK_FOR_UPDATES')),
  onAction('OPEN_RELEASES', () => electronAPI.send('OPEN_RELEASES')),
  onAction('SET_AUTOMATIC_UPDATES', ({ payload }) => electronAPI.send('SET_AUTOMATIC_UPDATES', payload)),
  // the restart quits the app, so the queue and the position are saved first (the main process closes the database after what it has queued)
  onAction('INSTALL_UPDATE', () => {
    saveSettings(store.getState().uiState);
    electronAPI.send('INSTALL_UPDATE');
  }),
  onAction('SET_NORMALIZATION', ({ payload }) => saveSettings({ ...store.getState().uiState, normalization: payload.mode })),
  onAction('SET_LAUNCHER', ({ payload }) => electronAPI.send('SET_LAUNCHER', payload)),
  // the main process has text of its own and follows the language from the saved settings
  // the handlers run before the reducer, so the saved settings get the new language here
  onAction('SET_LANGUAGE', ({ payload }) => saveSettings({ ...store.getState().uiState, language: payload.language })),
  // the main process matches its native parts (menus, dialogs) to the mode
  onAction('SET_THEME_MODE', ({ payload }) => {
    const { uiState } = store.getState();
    saveSettings({ ...uiState, theme: { ...uiState.theme, mode: payload.mode } });
  }),
  // the colour input fires while it is dragged, the main process does not need the accent before it is saved
  onAction('SET_ACCENT', () => saveLater(store)),
  onAction('SET_NAVIGATION_GROUP', () => saveLater(store)),
  onAction('SAVE_SETTINGS', () => saveSettings(store.getState().uiState)),
]);

const pageKinds: PageKind[] = ['tracks', 'albums', 'groupAlbums', 'artist', 'albumArtist', 'genre'];

const queryKeys = (state: RootState): Record<PageKind, string> => {
  const groups = JSON.stringify(selectGroupQuery(state));

  return {
    tracks: JSON.stringify(selectTrackQuery(state)),
    albums: JSON.stringify(selectAlbumQuery(state)),
    groupAlbums: JSON.stringify(selectGroupAlbumQuery(state)),
    artist: groups,
    albumArtist: groups,
    genre: groups,
  };
};

/**
 * A list whose sort or folders changed (picked, restored, or a selected folder left the library) is another list: its pages are dropped,
 * the ones still on their way are not stored, and the first page is fetched again by the view
 */
const createQueryWatcher = (store: Store) => {
  let keys = queryKeys(store.getState());

  return () => {
    const next = queryKeys(store.getState());
    const changed = pageKinds.filter((kind) => next[kind] !== keys[kind]);
    keys = next;
    changed.forEach((kind) => {
      generation += 1;
      store.dispatch({ type: 'RESET_LIBRARY', payload: { kind } });
    });
  };
};

const middleware: Middleware<object, RootState> = (store) => {
  if (window) start(store);

  const handle = handleActions(store);
  const watchQueries = createQueryWatcher(store);

  return (next) => (action) => {
    const result = handle(next)(action);
    watchQueries();
    return result;
  };
};

export default middleware;
