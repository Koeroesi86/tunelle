import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyMiddleware, createStore, type Middleware } from 'redux';
import type { z } from 'zod';
import type { emptyMessage, messageSchemas } from '@shared/schemas/messages';
import { stationFavourite, trackFavourite } from '../../domain/favourites';
import { aTrack } from '../../test/a-track';
import type { AppAction } from '../types';

vi.mock('../../startup', () => ({ hideSplash: vi.fn() }));

type Channel = keyof typeof messageSchemas;

const serverId = '6f1c2b9e-3a1d-4c5e-9b7a-2d8e4f6a1c3b';
const station = { uuid: 'station-1', name: 'Some FM', country: 'HU', tags: [], codec: 'MP3', bitrate: 128 };
const track = aTrack();
const server = { id: serverId, kind: 'subsonic', name: 'Home', url: 'https://music.example', username: 'someone' } as const;
const folders = [{ path: '/music', lastModified: 1 }];
const candidates = { query: 'Someone', candidates: [{ name: 'Someone', picture: 'a.jpg' }] };

/** A message of each channel the main process sends; the type fails the typecheck when a channel is added without a row */
const messages: { [C in Channel]: z.input<(typeof messageSchemas)[C]> } = {
  STORE_FOLDERS: { folders },
  FOLDERS_ADDED_TO_LIBRARY: { folders },
  OFFLINE_FOLDERS: { folders: ['/music'] },
  LOUDNESS_STATUS: { total: 3, measured: 1, failed: 0 },
  POWER_SAVING: { saving: true },
  SOFTWARE_RENDERING: { software: true },
  LOUDNESS_FAILED: { tracks: [{ path: '/music/a.flac', reason: null }] },
  ARTIST_PHOTO_FAILED: { reason: 'notImage' },
  ALBUM_COVER_FAILED: { reason: 'tooLarge' },
  ALBUM_COVER_CANDIDATES: candidates,
  ALBUM_COVER_CHANGED: { path: '/music/a.flac', title: 'An album', cover: null },
  ARTIST_PHOTO_CANDIDATES: candidates,
  BACKGROUND_TASKS: { tasks: [{ kind: 'scan', running: true, waiting: 0 }] },
  MAXIMIZED_APP: { maximized: true },
  SET_PLAYING: { isPlaying: true },
  LAUNCHER_STATE: { available: true, enabled: false, offered: false, external: false },
  REMOTE_HOST_STATE: { enabled: false, name: 'Desk', loopbackOnly: false, maxListeners: 1, running: false, addresses: [], pending: [], devices: [] },
  REMOTE_LISTENER_STATE: { status: 'idle' },
  REMOTE_NEARBY: [],
  UPDATE_STATE: { version: '1.0.0', electron: '1', chrome: '1', automatic: true, allowMetered: false, status: { kind: 'checking' } },
  CLICKED_URL: { playlist: [{ file: 'http://radio.example/a' }], url: 'http://radio.example/list.m3u' },
  SCANNING_FILE: { fileName: 'a.flac', progress: 1, totalCount: 2 },
  SCANNING_FOLDER: { folder: '/music' },
  RADIO_STATIONS: { query: { offset: 0 }, stations: [station] },
  RADIO_TAGS_LOADED: { tags: [{ name: 'jazz', stationCount: 1 }] },
  RADIO_OPTIONS_LOADED: { kind: 'codecs', options: [{ value: 'mp3', name: 'MP3', stationCount: 1 }] },
  RADIO_STREAM_TITLE: { uuid: station.uuid, title: 'A song' },
  RADIO_STREAM_RATE: { uuid: station.uuid, sampleRate: 44_100 },
  RADIO_STREAM_ART: { uuid: station.uuid, title: 'A song' },
  SOURCE_SERVERS_LOADED: { servers: [{ ...server, protected: true }] },
  SOURCE_SERVER_FAILED: { error: 'refused' },
  SOURCE_CERTIFICATE_READ: { url: server.url, certificate: 'pem', code: 'AB' },
  SOURCE_BROWSED: { request: { what: 'artists', serverId }, result: [] },
  SOURCE_DISCOVERED: { servers: [] },
  PLEX_ACCOUNT: { status: 'waiting' },
  FAVOURITES: { favourites: [] },
  HISTORY: { history: [] },
  PLAYLISTS: { playlists: [] },
  OPENED_FILES: { tracks: [track] },
  PLAYLIST_IMPORT_REPORT: { reports: [] },
};

/** The channels whose action has another name than the channel */
const renamed: Partial<Record<Channel, string>> = {
  SOURCE_DISCOVERED: 'SOURCE_SERVERS_DISCOVERED',
  FAVOURITES: 'FAVOURITES_LOADED',
  HISTORY: 'HISTORY_LOADED',
  PLAYLISTS: 'PLAYLISTS_LOADED',
  PLAYLIST_IMPORT_REPORT: 'PLAYLIST_IMPORT_REPORTED',
  OPENED_FILES: 'PLAY_TRACKS',
};

/** The channels without content, which `emptyMessage` checks */
const emptyChannels = ['RESCAN_COMPLETE', 'FOLDER_REMOVED_FROM_LIBRARY', 'ARTIST_PHOTOS_READY', 'LIBRARY_UPDATED', 'TRACKS_ADDED_TO_LIBRARY'] as const;
const emptyContent: z.input<typeof emptyMessage> = {};

const favouriteKey = { source: 'local', kind: 'track', id: '/music/a.flac' } as const;
const device = { deviceId: serverId };

/** An action of the page and the message that the main process gets for it */
const sent: [AppAction, ...unknown[]][] = [
  [{ type: 'PICK_FOLDERS', payload: {} }, 'PICK_FOLDERS'],
  [{ type: 'REMOVE_FOLDER', payload: { path: '/music' } }, 'REMOVE_FOLDER_FROM_LIBRARY', '/music'],
  [{ type: 'RESCAN_LIBRARY', payload: {} }, 'RESCAN_LIBRARY', { forced: true }],
  [{ type: 'CHANGE_ARTIST_PHOTO', payload: { key: 'a', change: 'remove' } }, 'ARTIST_PHOTO_CHANGE', { key: 'a', change: 'remove' }],
  [
    { type: 'CHANGE_ALBUM_COVER', payload: { path: '/a.flac', title: 'A', change: 'remove' } },
    'ALBUM_COVER_CHANGE',
    { path: '/a.flac', title: 'A', change: 'remove' },
  ],
  [{ type: 'SEARCH_ALBUM_COVERS', payload: { query: 'A' } }, 'ALBUM_COVER_SEARCH', { query: 'A' }],
  [{ type: 'SEARCH_ARTIST_PHOTOS', payload: { query: 'A' } }, 'ARTIST_PHOTO_SEARCH', { query: 'A' }],
  [{ type: 'LOAD_LOUDNESS_STATUS', payload: {} }, 'LOUDNESS_STATUS_LOAD'],
  [{ type: 'LOAD_LOUDNESS_FAILED', payload: {} }, 'LOUDNESS_FAILED_LOAD'],
  [{ type: 'CLEAR_MEASURED_LOUDNESS', payload: {} }, 'LOUDNESS_CLEAR'],
  [{ type: 'MINIMIZE_APP', payload: {} }, 'MINIMIZE_APP', {}],
  [{ type: 'MAXIMIZE_APP', payload: {} }, 'MAXIMIZE_APP', {}],
  [{ type: 'CLOSE_APP', payload: {} }, 'CLOSE_APP', {}],
  [{ type: 'PLAY_RADIO_STATION', payload: { station } }, 'HISTORY_RECORD', stationFavourite(station)],
  [{ type: 'PLAY_TRACK', payload: { track } }, 'HISTORY_RECORD', trackFavourite(track)],
  [{ type: 'PLAY_TRACK', payload: { track } }, 'LOUDNESS_PRIORITISE', { paths: [track.path], nowPlaying: true }],
  [{ type: 'PLAY_TRACKS', payload: { tracks: [track] } }, 'LOUDNESS_PRIORITISE', { paths: [track.path], nowPlaying: false }],
  [{ type: 'ADD_TO_QUEUE', payload: { tracks: [track] } }, 'LOUDNESS_PRIORITISE', { paths: [track.path], nowPlaying: false }],
  [{ type: 'PLAY_NEXT', payload: { tracks: [track] } }, 'LOUDNESS_PRIORITISE', { paths: [track.path], nowPlaying: false }],
  [{ type: 'LOAD_FAVOURITES', payload: {} }, 'FAVOURITES_LOAD'],
  [{ type: 'LOAD_HISTORY', payload: {} }, 'HISTORY_LOAD'],
  [{ type: 'LOAD_PLAYLISTS', payload: {} }, 'PLAYLISTS_LOAD'],
  [{ type: 'IMPORT_PLAYLISTS', payload: {} }, 'PLAYLIST_IMPORT'],
  [{ type: 'CREATE_PLAYLIST', payload: { name: 'Mix', tracks: [] } }, 'PLAYLIST_CREATE', { name: 'Mix', tracks: [] }],
  [{ type: 'RENAME_PLAYLIST', payload: { id: 1, name: 'Mix' } }, 'PLAYLIST_RENAME', { id: 1, name: 'Mix' }],
  [{ type: 'DELETE_PLAYLIST', payload: { id: 1 } }, 'PLAYLIST_DELETE', { id: 1 }],
  [{ type: 'EXPORT_PLAYLIST', payload: { id: 1 } }, 'PLAYLIST_EXPORT', { id: 1 }],
  [{ type: 'SYNC_PLAYLIST_FILE', payload: { id: 1, sync: true } }, 'PLAYLIST_SYNC', { id: 1, sync: true }],
  [{ type: 'SET_PLAYLIST_ENCODING', payload: { id: 1, encoding: 'utf-8' } }, 'PLAYLIST_ENCODING', { id: 1, encoding: 'utf-8' }],
  [{ type: 'UNDO_PLAYLIST_IMPORT', payload: { id: 1 } }, 'PLAYLIST_UNDO_IMPORT', { id: 1 }],
  [{ type: 'MOVE_PLAYLIST', payload: { id: 1, toIndex: 1 } }, 'PLAYLIST_MOVE', { id: 1, toIndex: 1 }],
  [{ type: 'ADD_TO_PLAYLIST', payload: { id: 1, tracks: [] } }, 'PLAYLIST_ADD', { id: 1, tracks: [] }],
  [{ type: 'REMOVE_FROM_PLAYLIST', payload: { id: 1, entryId: 2 } }, 'PLAYLIST_REMOVE_ENTRY', { id: 1, entryId: 2 }],
  [{ type: 'MOVE_PLAYLIST_ENTRY', payload: { id: 1, entryId: 2, toIndex: 1 } }, 'PLAYLIST_MOVE_ENTRY', { id: 1, entryId: 2, toIndex: 1 }],
  [{ type: 'CLEAR_HISTORY', payload: {} }, 'HISTORY_CLEAR'],
  [{ type: 'ADD_FAVOURITE', payload: { favourite: trackFavourite(track) } }, 'FAVOURITE_ADD', trackFavourite(track)],
  [{ type: 'REMOVE_FAVOURITE', payload: { key: favouriteKey } }, 'FAVOURITE_REMOVE', favouriteKey],
  [{ type: 'LOAD_SOURCE_SERVERS', payload: {} }, 'SOURCE_SERVERS'],
  [{ type: 'SAVE_SOURCE_SERVER', payload: { server: { ...server, password: 'secret' } } }, 'SOURCE_SERVER_SAVE', { ...server, password: 'secret' }],
  [{ type: 'REMOVE_SOURCE_SERVER', payload: { id: serverId } }, 'SOURCE_SERVER_REMOVE', { id: serverId }],
  [{ type: 'READ_SOURCE_CERTIFICATE', payload: { url: server.url } }, 'SOURCE_CERTIFICATE', { url: server.url }],
  [{ type: 'DISCOVER_SOURCE_SERVERS', payload: {} }, 'SOURCE_DISCOVER'],
  [{ type: 'SIGN_IN_PLEX', payload: {} }, 'PLEX_SIGN_IN'],
  [{ type: 'CANCEL_PLEX_SIGN_IN', payload: {} }, 'PLEX_SIGN_IN_CANCEL'],
  [{ type: 'ADD_PLEX_SERVER', payload: { id: 'p' } }, 'PLEX_SERVER_ADD', { id: 'p' }],
  [{ type: 'BROWSE_SOURCE', payload: { request: { what: 'artists', serverId } } }, 'SOURCE_BROWSE', { what: 'artists', serverId }],
  [
    { type: 'KEEP_SOURCE_PAGES', payload: { request: { what: 'artists', serverId }, pages: [0] } },
    'SOURCE_BROWSE_KEEP',
    { request: { what: 'artists', serverId }, pages: [0] },
  ],
  [{ type: 'SEARCH_RADIO', payload: { query: { offset: 0 } } }, 'RADIO_SEARCH', { offset: 0 }],
  [{ type: 'LOAD_RADIO_TAGS', payload: {} }, 'RADIO_TAGS'],
  [{ type: 'LOAD_RADIO_OPTIONS', payload: {} }, 'RADIO_OPTIONS'],
  [{ type: 'CHECK_FOR_UPDATES', payload: {} }, 'CHECK_FOR_UPDATES'],
  [{ type: 'OPEN_RELEASES', payload: {} }, 'OPEN_RELEASES'],
  [{ type: 'OPEN_FFMPEG_NOTICE', payload: {} }, 'OPEN_FFMPEG_NOTICE'],
  [{ type: 'OPEN_SPONSOR_PAGE', payload: {} }, 'OPEN_SPONSOR_PAGE'],
  [{ type: 'CONFIRM_METERED_UPDATE', payload: {} }, 'CONFIRM_METERED_UPDATE'],
  [{ type: 'CANCEL_METERED_UPDATE', payload: {} }, 'CANCEL_METERED_UPDATE'],
  [{ type: 'SET_ALLOW_METERED_UPDATES', payload: { enabled: true } }, 'SET_ALLOW_METERED_UPDATES', { enabled: true }],
  [{ type: 'SET_AUTOMATIC_UPDATES', payload: { enabled: true } }, 'SET_AUTOMATIC_UPDATES', { enabled: true }],
  [{ type: 'INSTALL_UPDATE', payload: {} }, 'INSTALL_UPDATE'],
  [{ type: 'SET_LAUNCHER', payload: { enabled: true } }, 'SET_LAUNCHER', { enabled: true }],
  [{ type: 'DECIDE_REMOTE_DEVICE', payload: { ...device, action: 'approve' } }, 'DECIDE_REMOTE_DEVICE', { ...device, action: 'approve' }],
  [{ type: 'SET_REMOTE_DEVICE_CONTROLS', payload: { ...device, controls: ['skip'] } }, 'SET_REMOTE_DEVICE_CONTROLS', { ...device, controls: ['skip'] }],
  [{ type: 'CONNECT_REMOTE_HOST', payload: { host: 'desk', port: 4000 } }, 'CONNECT_REMOTE_HOST', { host: 'desk', port: 4000 }],
  [{ type: 'CONFIRM_REMOTE_HOST', payload: { note: 'mine' } }, 'CONFIRM_REMOTE_HOST', { note: 'mine' }],
  [{ type: 'SEND_REMOTE_CONTROL', payload: { control: 'skip', direction: 'next' } }, 'SEND_REMOTE_CONTROL', { control: 'skip', direction: 'next' }],
  [{ type: 'LEAVE_REMOTE_HOST', payload: {} }, 'LEAVE_REMOTE_HOST'],
  [{ type: 'BROWSE_REMOTE_NEARBY', payload: { active: true } }, 'BROWSE_REMOTE_NEARBY', { active: true }],
  [{ type: 'KEEP_POSITION', payload: { currentTime: 3 } }, 'PLAYBACK_SNAPSHOT', { currentTime: 3 }],
];

/** An action that saves the settings, with what the saved settings then hold */
const saved: [AppAction, Record<string, unknown>][] = [
  [{ type: 'SET_WATCH_FOLDERS', payload: { enabled: false } }, { watchFolders: false }],
  [{ type: 'SET_POWER_SAVING', payload: { mode: 'always' } }, { powerSaving: 'always' }],
  [{ type: 'SET_MEASURE_LOUDNESS', payload: { enabled: false } }, { measureLoudness: false }],
  [{ type: 'SET_NOTIFY_LIBRARY_CHANGES', payload: { enabled: false } }, { notifyLibraryChanges: false }],
  [{ type: 'SET_ARTIST_PHOTOS', payload: { enabled: false } }, { artistPhotos: false }],
  [{ type: 'SET_NORMALIZATION', payload: { mode: 'album' } }, { normalization: 'album' }],
  [{ type: 'SET_OUTPUT_DEVICE', payload: { device: { id: 'dac', label: 'DAC' } } }, { outputDevice: { id: 'dac', label: 'DAC' } }],
  [{ type: 'SET_LANGUAGE', payload: { language: 'en' } }, { language: 'en' }],
  [{ type: 'SET_THEME_MODE', payload: { mode: 'light' } }, { theme: expect.objectContaining({ mode: 'light' }) }],
  [{ type: 'SAVE_SETTINGS', payload: {} }, { volume: expect.any(Number) }],
  // the window saves what it has before it closes
  [{ type: 'CLOSE_APP', payload: {} }, { volume: expect.any(Number) }],
  // the restart of an update quits the app
  [{ type: 'INSTALL_UPDATE', payload: {} }, { volume: expect.any(Number) }],
];

const setup = async () => {
  const send = vi.fn();
  const on = vi.fn();
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) }));
  const { setBackend } = await import('../../backend/backend');
  setBackend({
    send,
    on,
    resolveUrl: (route) => `tunelle://app${route}`,
    pathForFile: (file) => `/dropped/${file.name}`,
    capabilities: { blur: false, opaque: false, mpris: false },
  });
  const { default: reducers } = await import('../reducers');
  const { default: middleware } = await import('./middleware');
  const dispatched: unknown[] = [];
  const record: Middleware = () => (next) => (action) => {
    dispatched.push(action);
    return next(action);
  };
  const store = createStore(reducers, applyMiddleware(middleware, record));
  const receive = (channel: string, payload: unknown) => on.mock.calls.find(([name]) => name === channel)?.[1](payload);
  send.mockClear();
  dispatched.length = 0;
  return { store, send, receive, dispatched };
};

describe('connection middleware, message by message', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    vi.stubGlobal('Notification', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(Object.entries(messages))('dispatches an action for %s', async (channel, payload) => {
    const { receive, dispatched } = await setup();

    receive(channel, payload);

    expect(dispatched).toContainEqual(expect.objectContaining({ type: Object.entries(renamed).find(([name]) => name === channel)?.[1] ?? channel }));
  });

  it.each(emptyChannels)('dispatches an action for %s, which has no content', async (channel) => {
    const { receive, dispatched } = await setup();

    receive(channel, emptyContent);

    expect(dispatched).toContainEqual({ type: channel, payload: {} });
  });

  it.each(Object.keys(messages))('drops a %s message of the wrong shape', async (channel) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { receive, dispatched } = await setup();

    receive(channel, 'not a message');

    expect(dispatched).toEqual([]);
  });

  it('asks for the saved radio filters again once the settings arrive', async () => {
    const { receive, send } = await setup();

    receive('RESTORE_SETTINGS', { settings: { radioQuery: { tag: 'jazz' } } });

    expect(send).toHaveBeenCalledWith('RADIO_SEARCH', expect.objectContaining({ tag: 'jazz' }));
  });

  it('asks for no stations when the settings have no radio filters', async () => {
    const { receive, send } = await setup();

    receive('RESTORE_SETTINGS', { settings: {} });

    expect(send).not.toHaveBeenCalledWith('RADIO_SEARCH', expect.anything());
  });

  it.each(sent.map(([action, ...message]) => ({ type: action.type, channel: message[0], action, message })))(
    'sends $channel for $type',
    async ({ action, message }) => {
      const { store, send } = await setup();

      store.dispatch(action);

      expect(send.mock.calls).toContainEqual(message);
    }
  );

  it.each(saved.map(([action, settings]) => ({ type: action.type, action, settings })))('saves the settings for $type', async ({ action, settings }) => {
    const { store, send } = await setup();

    store.dispatch(action);

    expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining(settings));
  });

  it('saves the accent a moment after the last change of the colour', async () => {
    const { store, send } = await setup();

    store.dispatch({ type: 'SET_ACCENT', payload: { accent: '#112233' } });
    expect(send).not.toHaveBeenCalledWith('SAVE_SETTINGS', expect.anything());
    vi.advanceTimersByTime(500);

    expect(send).toHaveBeenCalledWith('SAVE_SETTINGS', expect.objectContaining({ theme: expect.objectContaining({ accent: '#112233' }) }));
  });

  it('adds the folders of the files that were dropped', async () => {
    const { store, send } = await setup();
    const file = Object.assign(new File([''], 'a.flac'), { webkitRelativePath: '' });

    store.dispatch({ type: 'FILES_ADDED', payload: { fileList: Object.assign([file], { item: () => file }) } });

    expect(send).toHaveBeenCalledWith('ADD_FOLDERS_TO_LIBRARY', [expect.objectContaining({ name: 'a.flac', path: '/dropped/a.flac' })]);
  });

  it('plays the addresses of a playlist that was clicked, with the address as the path and what it says of the title', async () => {
    const { receive, dispatched } = await setup();

    receive('CLICKED_URL', { playlist: [{ file: 'http://radio.example/a', title: 'A' }, { file: 'http://radio.example/b' }], url: 'u' });

    expect(dispatched).toContainEqual({
      type: 'PLAY_TRACKS',
      payload: {
        tracks: [
          expect.objectContaining({ path: 'http://radio.example/a', title: 'A' }),
          expect.objectContaining({ path: 'http://radio.example/b', title: '' }),
        ],
      },
    });
  });

  it('notifies about a track with its cover, and tells the app when the notification is clicked', async () => {
    const notification: { onclick?: () => void } = {};
    const Notification = vi.fn(function () {
      return notification;
    });
    vi.stubGlobal('Notification', Notification);
    const { store, send, dispatched } = await setup();
    const pictured = aTrack({ picture: 'cover.jpg' });

    store.dispatch({ type: 'PLAY_TRACK', payload: { track: pictured } });
    notification.onclick?.();

    expect(Notification).toHaveBeenCalledWith(pictured.title, expect.objectContaining({ icon: expect.stringContaining('albumart') }));
    expect(dispatched).toContainEqual({ type: 'CLICK_NOTIFICATION', payload: {} });
    expect(send).toHaveBeenCalledWith('NOTIFICATION_CLICKED', { track: pictured });
  });

  it('looks for the folders again when the window gets the focus', async () => {
    const { send } = await setup();

    window.dispatchEvent(new Event('focus'));

    expect(send).toHaveBeenCalledWith('CHECK_FOLDERS');
  });

  it('looks for the offline folders again every half a minute', async () => {
    const { receive, send } = await setup();
    receive('OFFLINE_FOLDERS', { folders: ['/music'] });
    send.mockClear();

    vi.advanceTimersByTime(30_000);

    expect(send).toHaveBeenCalledWith('CHECK_FOLDERS');
  });

  it('rescans an empty library after an hour', async () => {
    const { send } = await setup();

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(send).toHaveBeenCalledWith('RESCAN_LIBRARY', { forced: false });
  });
});
