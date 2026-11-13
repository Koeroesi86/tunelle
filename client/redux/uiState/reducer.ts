import type { Reducer } from 'redux';
import type { Track } from '@shared/types/library';
import { restoreCoverSize } from '../../utils/cover-size';
import { knownFolders, parseFolders } from '@shared/types/library-query';
import { parseRadioQuery } from '@shared/types/radio-query';
import { isAppAction } from '../types';
import type { OnlineView, UiState } from '../types';
import { radioUuidOf } from '../../domain/radio-track';
import { defaultTheme, parseAccent, restoreTheme } from '../../theme';
import { defaultNormalization } from '../../audio/loudness';
import { restoreOutputDevice } from '../../audio/output-device';
import { clampGain, defaultGains, restoreGains } from '../../audio/equalizer';
import { autoAccent } from '../../constants/theme';
import { coverSizes } from '../../constants/cover-size';

const initialState: UiState = {
  view: 'albums',
  onlineView: 'radio',
  libraryOpen: true,
  playlistsOpen: true,
  tab: 'home',
  favouritesSource: 'local',
  favouritesOrder: 'recent',
  showFaders: false,
  selectedTracks: {},
  outputDevices: [],
  playlistId: null,
  nowPlaying: [],
  played: [],
  currentSong: null,
  currentTime: 0,
  volume: 0.5,
  normalization: defaultNormalization,
  outputDevice: undefined,
  selectedAlbum: null,
  scanningFolder: null,
  progress: 0,
  totalCount: 0,
  maximized: false,
  isPlaying: false,
  upNext: null,
  playNext: [],
  streamTitle: null,
  streamArt: null,
  streamSampleRate: null,
  launcher: { available: false, enabled: false, offered: false, external: false },
  shuffle: false,
  repeat: false,
  equalizer: defaultGains,
  desktopBlur: false,
  language: undefined,
  // a saved theme restores as it was, so the cover colour is only what a theme that was never picked starts with
  theme: { ...defaultTheme, accent: autoAccent },
  trackSort: undefined,
  albumSort: undefined,
  coverSize: coverSizes.default,
  groupSort: undefined,
  artistPhotos: true,
  artistPhotoFailure: undefined,
  artistPhotoCandidates: undefined,
  artistPhotoRevision: 0,
  watchFolders: true,
  measureLoudness: true,
  loudnessStatus: undefined,
  loudnessFailed: undefined,
  backgroundTasks: [],
  notifyLibraryChanges: true,
  openGroup: undefined,
  groupFilter: '',
  libraryFolders: [],
  radioQuery: {},
  librarySearch: '',
};

// the Shoutcast page and the Spotify page are gone, any other saved view shows the radio
const restoreOnlineView = (): OnlineView => 'radio';

const byPath = (tracks: Track[]) => Object.fromEntries(tracks.map((track) => [track.path, track]));

const slashes = (path: string) => path.replace(/\\/g, '/');

/**
 * Whether a file is in the folder, a folder with the same start in its name is another one. The library stores the paths of tracks with forward
 * slashes and a folder keeps the ones it was picked with, so the two are compared with the same slash
 */
const isInside = (file: string, folder: string) => slashes(file).startsWith(`${slashes(folder).replace(/\/+$/, '')}/`);

const toNumber = (value: number | string) => parseFloat(`${value || 0}`);

const reducer: Reducer<UiState> = (state = initialState, action) => {
  if (!isAppAction(action)) return state;

  switch (action.type) {
    // another view starts with its list, not the open artist or genre of the previous one, and without the filter of its names
    // a search that is dropped with the view is another list of tracks, which does not keep the selection
    case 'SET_VIEW':
      return {
        ...state,
        view: action.payload.view,
        librarySearch: '',
        openGroup: undefined,
        groupFilter: '',
        selectedTracks: state.librarySearch === '' ? state.selectedTracks : {},
      };
    case 'SET_ONLINE_VIEW':
      return { ...state, onlineView: action.payload.view };
    case 'SET_FAVOURITES_SOURCE':
      return { ...state, favouritesSource: action.payload.source };
    case 'SET_FAVOURITES_ORDER':
      return { ...state, favouritesOrder: action.payload.order };
    case 'SET_SHOW_FADERS':
      return { ...state, showFaders: action.payload.show };
    case 'OUTPUT_DEVICES_LOADED':
      return { ...state, outputDevices: action.payload.devices };
    case 'TOGGLE_TRACK_SELECTION': {
      const { [action.payload.track.path]: removed, ...rest } = state.selectedTracks;
      return { ...state, selectedTracks: removed ? rest : { ...state.selectedTracks, [action.payload.track.path]: action.payload.track } };
    }
    case 'SELECT_TRACKS':
      return { ...state, selectedTracks: byPath(action.payload.tracks) };
    case 'CLEAR_TRACK_SELECTION':
      return { ...state, selectedTracks: {} };
    // the tracks of a folder that leave the library are not there to play any more: they leave the selection and the queue, and the song stops
    case 'REMOVE_FOLDER': {
      const kept = ({ path }: Track) => !isInside(path, action.payload.path);
      const stops = state.currentSong !== null && !kept(state.currentSong);
      return {
        ...state,
        selectedTracks: byPath(Object.values(state.selectedTracks).filter(kept)),
        nowPlaying: state.nowPlaying.filter(kept),
        played: state.played.filter(kept),
        playNext: state.playNext.filter((path) => !isInside(path, action.payload.path)),
        ...(stops && { currentSong: null, currentTime: 0, isPlaying: false, streamTitle: null, streamArt: null, streamSampleRate: null }),
      };
    }
    case 'SET_TRACK_SORT':
      return { ...state, trackSort: action.payload.sort, selectedTracks: {} };
    case 'SET_ALBUM_SORT':
      return { ...state, albumSort: action.payload.sort };
    case 'SET_COVER_SIZE':
      return { ...state, coverSize: restoreCoverSize(action.payload.size) };
    case 'SET_LIBRARY_SEARCH':
      return { ...state, librarySearch: action.payload.search, selectedTracks: state.librarySearch === action.payload.search ? state.selectedTracks : {} };
    case 'SET_ARTIST_PHOTOS':
      return { ...state, artistPhotos: action.payload.enabled };
    case 'SET_WATCH_FOLDERS':
      return { ...state, watchFolders: action.payload.enabled };
    case 'SET_MEASURE_LOUDNESS':
      return { ...state, measureLoudness: action.payload.enabled };
    case 'BACKGROUND_TASKS':
      return { ...state, backgroundTasks: action.payload.tasks };
    case 'SET_NOTIFY_LIBRARY_CHANGES':
      return { ...state, notifyLibraryChanges: action.payload.enabled };
    case 'LOUDNESS_STATUS':
      return { ...state, loudnessStatus: action.payload };
    case 'LOUDNESS_FAILED':
      return { ...state, loudnessFailed: action.payload.tracks };
    case 'CLEAR_MEASURED_LOUDNESS':
      return {
        ...state,
        loudnessFailed: undefined,
        loudnessStatus: state.loudnessStatus ? { ...state.loudnessStatus, measured: 0, failed: 0 } : undefined,
      };
    case 'SET_GROUP_SORT':
      return { ...state, groupSort: action.payload.sort };
    case 'SET_GROUP_FILTER':
      return { ...state, groupFilter: action.payload.filter };
    case 'OPEN_GROUP':
      return { ...state, openGroup: action.payload.group, artistPhotoFailure: undefined, artistPhotoCandidates: undefined };
    case 'CLOSE_GROUP':
      return { ...state, openGroup: undefined, artistPhotoFailure: undefined, artistPhotoCandidates: undefined };
    case 'CHANGE_ARTIST_PHOTO':
    case 'SEARCH_ARTIST_PHOTOS':
      return { ...state, artistPhotoFailure: undefined, artistPhotoCandidates: undefined };
    case 'ARTIST_PHOTO_CANDIDATES':
      return { ...state, artistPhotoCandidates: action.payload };
    case 'ARTIST_PHOTOS_READY':
      return { ...state, artistPhotoRevision: state.artistPhotoRevision + 1 };
    case 'ARTIST_PHOTO_FAILED':
      return { ...state, artistPhotoFailure: action.payload.reason };
    case 'SET_LIBRARY_FOLDERS':
      return { ...state, libraryFolders: parseFolders(action.payload.folders), selectedTracks: {} };
    // a folder that is not in the library any more is dropped from the selection
    case 'STORE_FOLDERS': {
      const libraryFolders = knownFolders(
        state.libraryFolders,
        action.payload.folders.map(({ path }) => path)
      );
      return libraryFolders.length === state.libraryFolders.length ? state : { ...state, libraryFolders, selectedTracks: {} };
    }
    // the page of a search is not part of what is saved
    case 'SEARCH_RADIO':
      return { ...state, radioQuery: parseRadioQuery(action.payload.query) };
    case 'PLAY_TRACKS':
      return { ...state, nowPlaying: action.payload.tracks, played: [], playNext: [] };
    // nothing is left to play, so the song stops with the queue
    case 'CLEAR_QUEUE':
      return {
        ...state,
        nowPlaying: [],
        played: [],
        playNext: [],
        currentSong: null,
        currentTime: 0,
        isPlaying: false,
        streamTitle: null,
        streamArt: null,
        streamSampleRate: null,
      };
    // the tracks go right after the song that plays and after the ones that were put next before, in the order they come, and
    // a track that is in the queue already moves there; the song that plays is not moved
    case 'PLAY_NEXT': {
      // the handler that starts the first track runs before this, so the song that plays can be one that is not in the queue yet
      const playing = state.nowPlaying.some(({ path }) => path === state.currentSong?.path) ? state.currentSong?.path : undefined;
      const tracks = action.payload.tracks.filter(({ path }, index, all) => path !== playing && all.findIndex((other) => other.path === path) === index);

      const moved = new Set(tracks.map(({ path }) => path));
      const rest = state.nowPlaying.filter(({ path }) => !moved.has(path));
      const waiting = new Set(state.playNext);
      const current = rest.findIndex(({ path }) => path === state.currentSong?.path);
      const following = rest.slice(current + 1);
      const queued = following.findIndex(({ path }) => !waiting.has(path));
      const at = current + 1 + (queued === -1 ? following.length : queued);

      return tracks.length
        ? {
            ...state,
            nowPlaying: [...rest.slice(0, at), ...tracks, ...rest.slice(at)],
            playNext: [
              ...state.playNext.filter((path) => !moved.has(path)),
              ...tracks.map(({ path }) => path).filter((path) => path !== state.currentSong?.path),
            ],
          }
        : state;
    }
    // a track that is in the queue already is not added a second time, the queue finds the song that plays by its path
    case 'ADD_TO_QUEUE': {
      const queued = new Set(state.nowPlaying.map(({ path }) => path));
      const added = action.payload.tracks.filter(({ path }, index, all) => !queued.has(path) && all.findIndex((other) => other.path === path) === index);
      return added.length ? { ...state, nowPlaying: [...state.nowPlaying, ...added] } : state;
    }
    case 'MOVE_QUEUE_TRACK': {
      const { from, to } = action.payload;
      const track = state.nowPlaying[from];
      return from === to || !track || to < 0 || to >= state.nowPlaying.length
        ? state
        : { ...state, nowPlaying: state.nowPlaying.toSpliced(from, 1).toSpliced(to, 0, track) };
    }
    case 'REMOVE_FROM_QUEUE':
      return state.nowPlaying[action.payload.index] ? { ...state, nowPlaying: state.nowPlaying.filter((_, index) => index !== action.payload.index) } : state;
    case 'PLAY_TRACK':
      // the position of the previous song would seek the new one to its end
      return {
        ...state,
        currentSong: action.payload.track || null,
        currentTime: 0,
        isPlaying: true,
        streamTitle: null,
        streamArt: null,
        streamSampleRate: null,
        playNext: state.playNext.filter((path) => path !== action.payload.track?.path),
      };
    case 'SET_VOLUME':
      return { ...state, volume: toNumber(action.payload.volume) };
    case 'SET_CURRENT_TIME': {
      const currentTime = toNumber(action.payload.currentTime);
      return currentTime === state.currentTime ? state : { ...state, currentTime };
    }
    case 'SELECT_ALBUM':
      return { ...state, selectedAlbum: action.payload.album || null };
    case 'SET_GAIN': {
      const { value, index } = action.payload;
      return { ...state, equalizer: state.equalizer.map((gain, band) => (band === index ? clampGain(toNumber(value)) : gain)) };
    }
    case 'SET_GAINS':
      return { ...state, equalizer: restoreGains(action.payload.gains) };
    case 'RADIO_STREAM_TITLE': {
      const { uuid, title } = action.payload;
      const isCurrent = state.currentSong && radioUuidOf(state.currentSong.path) === uuid;
      // the art stays until the art of the new song arrives (or the answer that there is none), so the cover is never empty in between
      return isCurrent && title !== state.streamTitle ? { ...state, streamTitle: title } : state;
    }
    case 'RADIO_STREAM_RATE': {
      const { uuid, sampleRate } = action.payload;
      const isCurrent = state.currentSong && radioUuidOf(state.currentSong.path) === uuid;
      return isCurrent && sampleRate !== state.streamSampleRate ? { ...state, streamSampleRate: sampleRate } : state;
    }
    case 'RADIO_STREAM_ART': {
      const { uuid, title, art } = action.payload;
      // the art of a song the station has moved on from is dropped, and no art found shows the logo of the station
      return state.currentSong && radioUuidOf(state.currentSong.path) === uuid && title === state.streamTitle ? { ...state, streamArt: art ?? null } : state;
    }
    case 'SCANNING_FOLDER':
      return { ...state, scanningFolder: action.payload.folder };
    case 'SCANNING_FILE':
      return { ...state, progress: action.payload.progress, totalCount: action.payload.totalCount };
    case 'RESCAN_COMPLETE':
      return { ...state, scanningFolder: null };
    case 'TRACKS_ADDED_TO_LIBRARY':
      // the added folders are shown as soon as they are scanned, instead of the folder list they were added from
      return { ...state, scanningFolder: null, view: state.view === 'folders' ? 'albums' : state.view };
    case 'MAXIMIZED_APP':
      return { ...state, maximized: action.payload.maximized };
    case 'SET_TAB':
      return { ...state, tab: action.payload.tab };
    case 'SET_NAVIGATION_GROUP': {
      const { group, open } = action.payload;
      return group === 'library' ? { ...state, libraryOpen: open } : { ...state, playlistsOpen: open };
    }
    case 'OPEN_PLAYLIST':
      return { ...state, tab: 'playlist', playlistId: action.payload.id };
    // the tab of a playlist that is gone shows nothing
    case 'DELETE_PLAYLIST':
      return state.playlistId === action.payload.id ? { ...state, playlistId: null, tab: state.tab === 'playlist' ? 'home' : state.tab } : state;
    case 'LAUNCHER_STATE':
      return { ...state, launcher: action.payload };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload.language };
    case 'SET_NORMALIZATION':
      return { ...state, normalization: action.payload.mode };
    case 'SET_OUTPUT_DEVICE':
      return { ...state, outputDevice: action.payload.device };
    case 'SET_THEME_MODE':
      return { ...state, theme: { ...state.theme, mode: action.payload.mode } };
    case 'SET_ACCENT':
      return { ...state, theme: { ...state.theme, accent: parseAccent(action.payload.accent) } };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload.isPlaying };
    case 'SET_UP_NEXT':
      return { ...state, upNext: action.payload.track };
    case 'TOGGLE_REPEAT':
      return { ...state, repeat: !state.repeat };
    case 'TOGGLE_SHUFFLE':
      return { ...state, shuffle: !state.shuffle };
    case 'TOGGLE_DESKTOP_BLUR':
      return { ...state, desktopBlur: !state.desktopBlur };
    case 'CLEAR_PLAYED':
      return { ...state, played: [] };
    case 'POP_PLAYED':
      return { ...state, played: state.played.slice(0, -1) };
    case 'ADD_PLAYED':
      return { ...state, played: action.payload.track ? [...state.played, action.payload.track] : state.played };
    case 'RESTORE_SETTINGS': {
      const { settings } = action.payload;
      return {
        ...state,
        ...settings,
        // a value of the wrong type is already left out of the settings (client/redux/persisted-settings.ts)
        // a tab saved by an earlier version does not decide where the app opens
        tab: state.tab,
        ...(settings.onlineView && { onlineView: restoreOnlineView() }),
        // the sidebar starts with both groups open, only a saved closed one closes it
        ...('libraryOpen' in settings && { libraryOpen: settings.libraryOpen !== false }),
        ...('playlistsOpen' in settings && { playlistsOpen: settings.playlistsOpen !== false }),
        ...(settings.equalizer && { equalizer: restoreGains(settings.equalizer) }),
        ...('outputDevice' in settings && { outputDevice: restoreOutputDevice(settings.outputDevice) }),
        ...(settings.theme && { theme: restoreTheme(settings.theme) }),
        ...('coverSize' in settings && { coverSize: restoreCoverSize(settings.coverSize) }),
        // only a saved off turns the photos off
        ...('artistPhotos' in settings && { artistPhotos: settings.artistPhotos !== false }),
        // only a saved off turns the watching off
        ...('watchFolders' in settings && { watchFolders: settings.watchFolders !== false }),
        // only a saved off turns the measurement off
        ...('measureLoudness' in settings && { measureLoudness: settings.measureLoudness !== false }),
        // only a saved off turns the notifications off
        ...('notifyLibraryChanges' in settings && { notifyLibraryChanges: settings.notifyLibraryChanges !== false }),
        ...('libraryFolders' in settings && { libraryFolders: parseFolders(settings.libraryFolders) }),
      };
    }
    default:
      return state;
  }
};

export default reducer;
