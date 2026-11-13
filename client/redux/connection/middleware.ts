import type { Middleware } from 'redux';
import type { Track } from '@shared/types/library';

import type { GroupSummary } from '@shared/types/library';
import type { GroupKind } from '@shared/types/library-query';

import { electronAPI } from '../../services/electron-api';
import { z } from 'zod';
import { maxPrioritisedTracks } from '@shared/constants/loudness';
import { restoredSettingsSchema } from '../persisted-settings';
import { onMessage } from '../../services/on-message';
import { emptyMessage, messageSchemas } from '@shared/schemas/messages';
import { debounce } from '../../utils/debounce';
import type { RootState } from '../reducers';
import toAddedFiles from '../../domain/added-files';
import { getCoverUrl } from '../../utils/cover-url';
import { isFavourite, stationFavourite, trackFavourite } from '../../domain/favourites';
import { isHistoryItem } from '../../domain/history';
import { toPlaylist } from '../../domain/playlists';
import { radioUuidOf } from '../../domain/radio-track';
import { fetchAlbumPage, fetchGroupPage, fetchTrackPage } from '../../services/library-api';
import { selectAlbumQuery, selectGroupAlbumQuery, selectGroupQuery, selectTrackQuery } from '../../domain/library-query';
import { hideSplash } from '../../startup';
import { actionMiddleware, onAction } from '../on-action';

import type { Store } from '../on-action';
import type { PageKind, PersistedSettings, PlaylistItem, UiState } from '../types';

function addListeners(store: Store) {
  onMessage('STORE_FOLDERS', messageSchemas.STORE_FOLDERS, (payload) => store.dispatch({ type: 'STORE_FOLDERS', payload }));
  onMessage('BACKGROUND_TASKS', messageSchemas.BACKGROUND_TASKS, (payload) => store.dispatch({ type: 'BACKGROUND_TASKS', payload }));
  onMessage('LOUDNESS_STATUS', messageSchemas.LOUDNESS_STATUS, (payload) => store.dispatch({ type: 'LOUDNESS_STATUS', payload }));
  onMessage('LOUDNESS_FAILED', messageSchemas.LOUDNESS_FAILED, (payload) => store.dispatch({ type: 'LOUDNESS_FAILED', payload }));
  onMessage('OFFLINE_FOLDERS', messageSchemas.OFFLINE_FOLDERS, (payload) => store.dispatch({ type: 'OFFLINE_FOLDERS', payload }));
  onMessage('RESCAN_COMPLETE', emptyMessage, (payload) => store.dispatch({ type: 'RESCAN_COMPLETE', payload }));
  onMessage('FOLDERS_ADDED_TO_LIBRARY', messageSchemas.FOLDERS_ADDED_TO_LIBRARY, (payload) => store.dispatch({ type: 'FOLDERS_ADDED_TO_LIBRARY', payload }));
  onMessage('FOLDER_REMOVED_FROM_LIBRARY', emptyMessage, (payload) => store.dispatch({ type: 'FOLDER_REMOVED_FROM_LIBRARY', payload }));
  onMessage('ARTIST_PHOTO_FAILED', messageSchemas.ARTIST_PHOTO_FAILED, (payload) => store.dispatch({ type: 'ARTIST_PHOTO_FAILED', payload }));
  onMessage('ALBUM_COVER_FAILED', messageSchemas.ALBUM_COVER_FAILED, (payload) => store.dispatch({ type: 'ALBUM_COVER_FAILED', payload }));
  onMessage('ALBUM_COVER_CANDIDATES', messageSchemas.ALBUM_COVER_CANDIDATES, (payload) => store.dispatch({ type: 'ALBUM_COVER_CANDIDATES', payload }));
  onMessage('ALBUM_COVER_CHANGED', messageSchemas.ALBUM_COVER_CHANGED, (payload) => store.dispatch({ type: 'ALBUM_COVER_CHANGED', payload }));
  onMessage('ARTIST_PHOTO_CANDIDATES', messageSchemas.ARTIST_PHOTO_CANDIDATES, (payload) => store.dispatch({ type: 'ARTIST_PHOTO_CANDIDATES', payload }));
  onMessage('ARTIST_PHOTOS_READY', emptyMessage, (payload) => store.dispatch({ type: 'ARTIST_PHOTOS_READY', payload }));
  onMessage('LIBRARY_UPDATED', emptyMessage, (payload) => store.dispatch({ type: 'LIBRARY_UPDATED', payload }));
  onMessage('TRACKS_ADDED_TO_LIBRARY', emptyMessage, (payload) => store.dispatch({ type: 'TRACKS_ADDED_TO_LIBRARY', payload }));
  onMessage('MAXIMIZED_APP', messageSchemas.MAXIMIZED_APP, (payload) => store.dispatch({ type: 'MAXIMIZED_APP', payload }));
  onMessage('CLICKED_URL', messageSchemas.CLICKED_URL, (payload) => store.dispatch({ type: 'CLICKED_URL', payload }));
  onMessage('SET_PLAYING', messageSchemas.SET_PLAYING, (payload) => store.dispatch({ type: 'SET_PLAYING', payload }));
  onMessage('LAUNCHER_STATE', messageSchemas.LAUNCHER_STATE, (payload) => store.dispatch({ type: 'LAUNCHER_STATE', payload }));
  onMessage('UPDATE_STATE', messageSchemas.UPDATE_STATE, (payload) => store.dispatch({ type: 'UPDATE_STATE', payload }));
  // a key of the wrong type is left out, the others are restored (client/redux/persisted-settings.ts)
  onMessage('RESTORE_SETTINGS', z.object({ settings: restoredSettingsSchema }), (payload) => {
    store.dispatch({ type: 'RESTORE_SETTINGS', payload });
    // the list that opened before the settings arrived was asked for without the saved filters, and its answer is dropped
    const { radioQuery } = payload.settings;
    if (radioQuery) store.dispatch({ type: 'SEARCH_RADIO', payload: { query: radioQuery } });
  });
  onMessage('SCANNING_FILE', messageSchemas.SCANNING_FILE, (payload) => store.dispatch({ type: 'SCANNING_FILE', payload }));
  onMessage('RADIO_STATIONS', messageSchemas.RADIO_STATIONS, (payload) => store.dispatch({ type: 'RADIO_STATIONS', payload }));
  onMessage('RADIO_TAGS_LOADED', messageSchemas.RADIO_TAGS_LOADED, (payload) => store.dispatch({ type: 'RADIO_TAGS_LOADED', payload }));
  onMessage('RADIO_OPTIONS_LOADED', messageSchemas.RADIO_OPTIONS_LOADED, (payload) => store.dispatch({ type: 'RADIO_OPTIONS_LOADED', payload }));
  onMessage('RADIO_STREAM_RATE', messageSchemas.RADIO_STREAM_RATE, (payload) => store.dispatch({ type: 'RADIO_STREAM_RATE', payload }));
  onMessage('RADIO_STREAM_TITLE', messageSchemas.RADIO_STREAM_TITLE, (payload) => store.dispatch({ type: 'RADIO_STREAM_TITLE', payload }));
  onMessage('RADIO_STREAM_ART', messageSchemas.RADIO_STREAM_ART, (payload) => store.dispatch({ type: 'RADIO_STREAM_ART', payload }));
  // a favourite of a source this version does not know is left out
  onMessage('FAVOURITES', messageSchemas.FAVOURITES, ({ favourites }) =>
    store.dispatch({ type: 'FAVOURITES_LOADED', payload: { favourites: favourites.filter(isFavourite) } })
  );
  onMessage('HISTORY', messageSchemas.HISTORY, ({ history }) =>
    store.dispatch({ type: 'HISTORY_LOADED', payload: { history: history.filter(isHistoryItem) } })
  );
  // a track the player cannot show (saved by a newer version) is left out of its playlist
  onMessage('PLAYLISTS', messageSchemas.PLAYLISTS, ({ playlists }) =>
    store.dispatch({ type: 'PLAYLISTS_LOADED', payload: { playlists: playlists.flatMap(toPlaylist) } })
  );
  onMessage('SCANNING_FOLDER', messageSchemas.SCANNING_FOLDER, (payload) => store.dispatch({ type: 'SCANNING_FOLDER', payload }));
}

function rescanLibrary(forced = false) {
  electronAPI.send('RESCAN_LIBRARY', { forced });
}

const appLoaded = debounce(() => {
  hideSplash();
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
  'outputDevice',
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
  'measureLoudness',
  'notifyLibraryChanges',
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
  electronAPI.send('BACKGROUND_TASKS_LOAD');

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

/** The tracks that are queued or start are measured before the rest of the library, the first ones only; the main process leaves out the ones that are measured or not in the library */
const prioritiseLoudness = (tracks: Pick<Track, 'path'>[]) =>
  electronAPI.send('LOUDNESS_PRIORITISE', { paths: tracks.slice(0, maxPrioritisedTracks).map((track) => track.path) });

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
  onAction('CHANGE_ARTIST_PHOTO', ({ payload }) => electronAPI.send('ARTIST_PHOTO_CHANGE', payload)),
  onAction('CHANGE_ALBUM_COVER', ({ payload }) => electronAPI.send('ALBUM_COVER_CHANGE', payload)),
  onAction('SEARCH_ALBUM_COVERS', ({ payload }) => electronAPI.send('ALBUM_COVER_SEARCH', payload)),
  onAction('SEARCH_ARTIST_PHOTOS', ({ payload }) => electronAPI.send('ARTIST_PHOTO_SEARCH', payload)),
  onAction('SET_WATCH_FOLDERS', ({ payload }) => saveSettings({ ...store.getState().uiState, watchFolders: payload.enabled })),
  onAction('SET_MEASURE_LOUDNESS', ({ payload }) => saveSettings({ ...store.getState().uiState, measureLoudness: payload.enabled })),
  onAction('SET_NOTIFY_LIBRARY_CHANGES', ({ payload }) => saveSettings({ ...store.getState().uiState, notifyLibraryChanges: payload.enabled })),
  onAction('LOAD_LOUDNESS_STATUS', () => electronAPI.send('LOUDNESS_STATUS_LOAD')),
  onAction('LOAD_LOUDNESS_FAILED', () => electronAPI.send('LOUDNESS_FAILED_LOAD')),
  onAction('CLEAR_MEASURED_LOUDNESS', () => electronAPI.send('LOUDNESS_CLEAR')),
  onAction('LOAD_LIBRARY_PAGE', ({ payload }) => void loadPage(store, payload.kind, payload.page)),
  // tracks stored while a scan runs: the list on the screen shows them, the favourites and the rest wait for the end of the scan
  onAction('LIBRARY_UPDATED', () => {
    generation += 1;
    store.dispatch({ type: 'INVALIDATE_LIBRARY' });
  }),
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
  ...(['PLAY_TRACKS', 'ADD_TO_QUEUE', 'PLAY_NEXT'] as const).map((type) => onAction(type, ({ payload }) => prioritiseLoudness(payload.tracks))),
  onAction('PLAY_TRACK', ({ payload }) => {
    if (!payload.track) return;

    prioritiseLoudness([payload.track]);
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
  onAction('OPEN_FFMPEG_NOTICE', () => electronAPI.send('OPEN_FFMPEG_NOTICE')),
  onAction('CONFIRM_METERED_UPDATE', () => electronAPI.send('CONFIRM_METERED_UPDATE')),
  onAction('CANCEL_METERED_UPDATE', () => electronAPI.send('CANCEL_METERED_UPDATE')),
  onAction('SET_ALLOW_METERED_UPDATES', ({ payload }) => electronAPI.send('SET_ALLOW_METERED_UPDATES', payload)),
  onAction('SET_AUTOMATIC_UPDATES', ({ payload }) => electronAPI.send('SET_AUTOMATIC_UPDATES', payload)),
  // the restart quits the app, so the queue and the position are saved first (the main process closes the database after what it has queued)
  onAction('INSTALL_UPDATE', () => {
    saveSettings(store.getState().uiState);
    electronAPI.send('INSTALL_UPDATE');
  }),
  onAction('SET_NORMALIZATION', ({ payload }) => saveSettings({ ...store.getState().uiState, normalization: payload.mode })),
  onAction('SET_OUTPUT_DEVICE', ({ payload }) => saveSettings({ ...store.getState().uiState, outputDevice: payload.device })),
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
