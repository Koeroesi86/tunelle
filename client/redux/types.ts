import type { Album, AlbumSummary, Folder, GroupSummary, Track } from '../../types/library';
import type { Favourite, FavouriteKey, HistoryItem, NewFavourite } from '../../types/favourites';
import type { RadioOption, RadioOptionKind, RadioQuery, RadioStation, RadioTag } from '../../types/radio';
import type { Playlist } from '../../types/playlists';
import type { ThemeMode, ThemeSettings } from '../../types/theme';
import type { NormalizationMode } from '../audio/loudness';
import type { AlbumSort, GroupKind, GroupSort, TrackSort } from '../../types/library-query';
import type { UpdateState } from '../../types/update';

export type LibraryView = 'albums' | 'artists' | 'albumArtists' | 'genres' | 'tracks' | 'folders';

/** The lists of the library that are fetched a page at a time: the tracks, the albums, the artists, album artists or genres, and the albums of the open one of those */
export type PageKind = 'tracks' | 'albums' | 'groupAlbums' | GroupKind;

/** The artist, album artist or genre the library view has opened, to show its albums */
export interface OpenGroup {
  kind: GroupKind;
  /** The name as the library compares it, empty for the tracks that have none */
  key: string;
  /** The name as it is written, empty for the tracks that have none */
  name: string;
}
export type OnlineView = 'radio';

/** The groups of the sidebar that open and close */
export type NavigationGroup = 'library' | 'playlists';
export type Tab = 'home' | 'now-playing' | 'local' | 'online-sources' | 'favourites' | 'playlist' | 'equalizer' | 'settings';

export interface PlaylistItem {
  file: string;
  title?: string;
}

/** The part of the UI state that is persisted between sessions */
export interface PersistedSettings {
  view: LibraryView;
  onlineView: OnlineView;
  /** Whether the Library group of the sidebar shows its views, and whether the Playlists group shows the playlists, both start open */
  libraryOpen: boolean;
  playlistsOpen: boolean;
  nowPlaying: Track[];
  played: Track[];
  currentSong: Track | null;
  currentTime: number;
  volume: number;
  /** Whether the tracks are levelled by their ReplayGain tags, and by which of them */
  normalization: NormalizationMode;
  selectedAlbum: Album | null;
  maximized: boolean;
  shuffle: boolean;
  repeat: boolean;
  equalizer: number[];
  /** The desktop blurs behind the window (Blur my Shell on GNOME), so the panels can be translucent */
  desktopBlur: boolean;
  /** The language picked in the settings, undefined follows the system language */
  language: string | undefined;
  /** The mode and the accent colour picked in the settings */
  theme: ThemeSettings;
  /** The sort of the tracks and of the albums, undefined is the default order */
  trackSort: TrackSort | undefined;
  albumSort: AlbumSort | undefined;
  /** The least width of a cover of the album grid in px */
  coverSize: number;
  /** The sort of the artists, the album artists and the genres */
  groupSort: GroupSort | undefined;
  /** Whether the photos of the artists are looked up at Deezer, which gets the names of the artists */
  artistPhotos: boolean;
  /** Whether the library folders are watched, so a file that is added, changed or removed is picked up without a rescan */
  watchFolders: boolean;
  /** The library folders the local collection is limited to, none is all of them */
  libraryFolders: string[];
  /** The search of the radio stations: the filters and the sort, the page is not saved */
  radioQuery: RadioQuery;
}

export interface UiState extends PersistedSettings {
  /** The text the albums and the tracks are searched for, it is not saved and starts empty with every view */
  librarySearch: string;
  /** The artist, album artist or genre that is open, and the text the artists, album artists and genres are filtered by; neither is saved */
  openGroup: OpenGroup | undefined;
  groupFilter: string;
  /** The app opens on the home screen, the tab is not saved */
  tab: Tab;
  /** The playlist the playlist tab shows */
  playlistId: number | null;
  scanningFolder: string | null;
  progress: number;
  totalCount: number;
  isPlaying: boolean;
  /** The track that plays after the current one, chosen early so the player can load it before the current one ends; it follows the queue, not saved */
  upNext: Track | null;
  /** The track the current radio station is playing, as the stream announces it */
  streamTitle: string | null;
  /** The key of the art the main process found for the stream title, null while it is looked up or when there is none */
  streamArt: string | null;
  /** Whether the app can add itself to the application menu (from an AppImage on Linux), and whether it did, and whether the user was asked */
  launcher: { available: boolean; enabled: boolean; offered: boolean };
}

type EmptyPayload = Record<string, never>;

type EmptyAction<T extends string> = { type: T; payload?: EmptyPayload };
type PayloadAction<T extends string, P> = { type: T; payload: P };

export type AppAction =
  | { type: 'APP_INIT' }
  | EmptyAction<'APP_LOADED'>
  | EmptyAction<'CLOSE_APP'>
  | EmptyAction<'MINIMIZE_APP'>
  | EmptyAction<'MAXIMIZE_APP'>
  | EmptyAction<'SAVE_SETTINGS'>
  | EmptyAction<'RESCAN_LIBRARY'>
  | EmptyAction<'RESCAN_COMPLETE'>
  | EmptyAction<'TRACKS_ADDED_TO_LIBRARY'>
  | EmptyAction<'TRACK_ENDED'>
  | EmptyAction<'NEXT_SONG'>
  | EmptyAction<'PREVIOUS_SONG'>
  | EmptyAction<'TOGGLE_REPEAT'>
  | EmptyAction<'TOGGLE_SHUFFLE'>
  | EmptyAction<'TOGGLE_DESKTOP_BLUR'>
  | EmptyAction<'CLEAR_PLAYED'>
  | EmptyAction<'POP_PLAYED'>
  | EmptyAction<'LOAD_RADIO_TAGS'>
  | EmptyAction<'LOAD_RADIO_OPTIONS'>
  | EmptyAction<'LOAD_FAVOURITES'>
  | EmptyAction<'LOAD_HISTORY'>
  | EmptyAction<'LOAD_PLAYLISTS'>
  | EmptyAction<'CLEAR_HISTORY'>
  | EmptyAction<'CLICK_NOTIFICATION'>
  | EmptyAction<'CHECK_FOR_UPDATES'>
  | EmptyAction<'INSTALL_UPDATE'>
  | EmptyAction<'OPEN_RELEASES'>
  | PayloadAction<'SET_AUTOMATIC_UPDATES', { enabled: boolean }>
  | PayloadAction<'UPDATE_STATE', UpdateState>
  | PayloadAction<'SEARCH_RADIO', { query: RadioQuery }>
  | PayloadAction<'RADIO_STATIONS', { query: RadioQuery; stations: RadioStation[]; hasMore?: boolean; error?: string }>
  | PayloadAction<'RADIO_TAGS_LOADED', { tags: RadioTag[] }>
  | PayloadAction<'RADIO_OPTIONS_LOADED', { kind: RadioOptionKind; options: RadioOption[] }>
  | PayloadAction<'FAVOURITES_LOADED', { favourites: Favourite[] }>
  | PayloadAction<'HISTORY_LOADED', { history: HistoryItem[] }>
  | PayloadAction<'PLAYLISTS_LOADED', { playlists: Playlist[] }>
  | PayloadAction<'OPEN_PLAYLIST', { id: number }>
  | PayloadAction<'CREATE_PLAYLIST', { name: string; tracks?: Track[] }>
  | PayloadAction<'RENAME_PLAYLIST', { id: number; name: string }>
  | PayloadAction<'DELETE_PLAYLIST', { id: number }>
  | PayloadAction<'MOVE_PLAYLIST', { id: number; toIndex: number }>
  | PayloadAction<'ADD_TO_PLAYLIST', { id: number; tracks: Track[] }>
  | PayloadAction<'REMOVE_FROM_PLAYLIST', { id: number; entryId: number }>
  | PayloadAction<'MOVE_PLAYLIST_ENTRY', { id: number; entryId: number; toIndex: number }>
  | PayloadAction<'ADD_FAVOURITE', { favourite: NewFavourite }>
  | PayloadAction<'REMOVE_FAVOURITE', { key: FavouriteKey }>
  | PayloadAction<'PLAY_RADIO_STATION', { station: RadioStation }>
  | PayloadAction<'RADIO_STREAM_TITLE', { uuid: string; title: string }>
  | PayloadAction<'RADIO_STREAM_ART', { uuid: string; title: string; art: string }>
  | PayloadAction<'FOLDERS_ADDED_TO_LIBRARY', { folders: Folder[] }>
  | PayloadAction<'STORE_FOLDERS', { folders: Folder[] }>
  | PayloadAction<'OFFLINE_FOLDERS', { folders: string[] }>
  | EmptyAction<'PICK_FOLDERS'>
  | EmptyAction<'INVALIDATE_LIBRARY'>
  | PayloadAction<'LOAD_LIBRARY_PAGE', { kind: PageKind; page: number }>
  | PayloadAction<'STORE_TRACK_PAGE', { page: number; items: Track[]; total: number }>
  | PayloadAction<'RESET_LIBRARY', { kind: PageKind }>
  | PayloadAction<'STORE_GROUP_PAGE', { kind: GroupKind; page: number; items: GroupSummary[]; total: number }>
  | PayloadAction<'STORE_GROUP_ALBUM_PAGE', { page: number; items: AlbumSummary[]; total: number }>
  | PayloadAction<'SET_ARTIST_PHOTOS', { enabled: boolean }>
  | PayloadAction<'SET_WATCH_FOLDERS', { enabled: boolean }>
  | EmptyAction<'ARTIST_PHOTOS_READY'>
  | PayloadAction<'SET_GROUP_SORT', { sort: GroupSort | undefined }>
  | PayloadAction<'SET_GROUP_FILTER', { filter: string }>
  | PayloadAction<'OPEN_GROUP', { group: OpenGroup }>
  | EmptyAction<'CLOSE_GROUP'>
  | PayloadAction<'SET_TRACK_SORT', { sort: TrackSort | undefined }>
  | PayloadAction<'SET_ALBUM_SORT', { sort: AlbumSort | undefined }>
  | PayloadAction<'SET_COVER_SIZE', { size: number }>
  | PayloadAction<'SET_LIBRARY_FOLDERS', { folders: string[] }>
  | PayloadAction<'SET_LIBRARY_SEARCH', { search: string }>
  | PayloadAction<'STORE_ALBUM_PAGE', { page: number; items: AlbumSummary[]; total: number }>
  | PayloadAction<'FILES_ADDED', { fileList: FileList }>
  | PayloadAction<'REMOVE_FOLDER', { path: string }>
  | EmptyAction<'FOLDER_REMOVED_FROM_LIBRARY'>
  | PayloadAction<'CLICKED_URL', { playlist: PlaylistItem[]; url: string }>
  | PayloadAction<'RESTORE_SETTINGS', { settings: Partial<PersistedSettings> }>
  | PayloadAction<'SCANNING_FOLDER', { folder: string }>
  | PayloadAction<'SCANNING_FILE', { fileName: string; progress: number; totalCount: number }>
  | PayloadAction<'MAXIMIZED_APP', { maximized: boolean }>
  | PayloadAction<'SET_PLAYING', { isPlaying: boolean }>
  | PayloadAction<'SET_UP_NEXT', { track: Track | null }>
  | PayloadAction<'LAUNCHER_STATE', { available: boolean; enabled: boolean; offered: boolean }>
  | PayloadAction<'SET_LAUNCHER', { enabled: boolean }>
  | PayloadAction<'SET_LANGUAGE', { language: string | undefined }>
  | PayloadAction<'SET_THEME_MODE', { mode: ThemeMode }>
  | PayloadAction<'SET_ACCENT', { accent: string | undefined }>
  | PayloadAction<'SET_VIEW', { view: LibraryView }>
  | PayloadAction<'SET_ONLINE_VIEW', { view: OnlineView }>
  | PayloadAction<'SET_TAB', { tab: Tab }>
  | PayloadAction<'SET_NAVIGATION_GROUP', { group: NavigationGroup; open: boolean }>
  | PayloadAction<'SET_NORMALIZATION', { mode: NormalizationMode }>
  | PayloadAction<'SET_VOLUME', { volume: number | string }>
  | PayloadAction<'SET_CURRENT_TIME', { currentTime: number | string }>
  | PayloadAction<'SET_GAIN', { value: number | string; index: number }>
  | PayloadAction<'SET_GAINS', { gains: number[] }>
  | PayloadAction<'SELECT_ALBUM', { album: Album | null }>
  | PayloadAction<'PLAY_TRACKS', { tracks: Track[] }>
  | EmptyAction<'CLEAR_QUEUE'>
  | PayloadAction<'ADD_TO_QUEUE', { tracks: Track[] }>
  | PayloadAction<'MOVE_QUEUE_TRACK', { from: number; to: number }>
  | PayloadAction<'REMOVE_FROM_QUEUE', { index: number }>
  | PayloadAction<'PLAY_TRACK', { track: Track | null }>
  | PayloadAction<'FORCE_PLAY_TRACK', { track: Track }>
  | PayloadAction<'ADD_PLAYED', { track: Track | null }>;

export const isAppAction = (action: unknown): action is AppAction =>
  typeof action === 'object' && action !== null && 'type' in action && typeof action.type === 'string';
