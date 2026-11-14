import { z } from 'zod';
import type { Album, Track } from '@shared/types/library';
import { albumSortSchema, groupSortSchema, trackSortSchema } from '@shared/types/library-query';
import { radioQuerySchema } from '@shared/types/radio-query';
import { powerSavingModeSchema } from '@shared/schemas/settings';
import { normalizationModes } from '../audio/loudness';

/** A track the player can show; the rest of what a track from an older version carries is not needed, so only these are checked */
const trackSchema = z.custom<Track>((value) => z.looseObject({ path: z.string(), title: z.string() }).safeParse(value).success);

const albumSchema = z.custom<Album>(
  (value) => z.looseObject({ id: z.string(), title: z.string(), path: z.string(), tracks: z.array(trackSchema) }).safeParse(value).success
);

const libraryViewSchema = z.enum(['albums', 'artists', 'albumArtists', 'genres', 'tracks', 'folders']);

const onlineViewSchema = z.enum(['radio']);

/** The part of the UI state that is persisted between sessions, by key (the keys are saved by client/redux/connection/middleware.ts) */
const persistedShape = {
  view: libraryViewSchema,
  onlineView: onlineViewSchema,
  /** Whether the Library group of the sidebar shows its views, and whether the Playlists group shows the playlists, both start open */
  libraryOpen: z.boolean(),
  playlistsOpen: z.boolean(),
  nowPlaying: z.array(trackSchema),
  played: z.array(trackSchema),
  currentSong: trackSchema.nullable(),
  currentTime: z.number(),
  volume: z.number(),
  /** Whether the tracks are levelled by their ReplayGain tags, and by which of them */
  normalization: z.enum(normalizationModes),
  /** The output device picked in the settings, undefined follows the system default */
  outputDevice: z.object({ id: z.string(), label: z.string() }).optional(),
  selectedAlbum: albumSchema.nullable(),
  maximized: z.boolean(),
  shuffle: z.boolean(),
  repeat: z.boolean(),
  equalizer: z.array(z.number()),
  /** The desktop blurs behind the window (Blur my Shell on GNOME), so the panels can be translucent */
  desktopBlur: z.boolean(),
  /** Whether the motion of the app is stopped, besides when the system asks for it */
  reduceMotion: z.boolean(),
  /** The language picked in the settings, undefined follows the system language */
  language: z.string().optional(),
  /** The mode and the accent colour picked in the settings; a part that is not valid is the default */
  theme: z.object({ mode: z.enum(['system', 'light', 'dark']).catch('system'), accent: z.string().optional().catch(undefined) }),
  /** The sort of the tracks and of the albums, undefined is the default order */
  trackSort: trackSortSchema.optional(),
  albumSort: albumSortSchema.optional(),
  /** The least width of a cover of the album grid in px */
  coverSize: z.number(),
  /** The sort of the artists, the album artists and the genres */
  groupSort: groupSortSchema.optional(),
  /** Whether the photos of the artists are looked up at Deezer, which gets the names of the artists */
  artistPhotos: z.boolean(),
  /** Whether the library folders are watched, so a file that is added, changed or removed is picked up without a rescan */
  watchFolders: z.boolean(),
  /** Whether the loudness of the tracks without ReplayGain tags is measured in the background (the main process reads it) */
  measureLoudness: z.boolean(),
  /** When the background work is lowered: with the power source, always or never (the main process reads it) */
  powerSaving: powerSavingModeSchema,
  /** Whether a notification tells what a scan changed in the library while the window is in the background (the main process reads it) */
  notifyLibraryChanges: z.boolean(),
  /** The library folders the local collection is limited to, none is all of them */
  libraryFolders: z.array(z.string()),
  /** The search of the radio stations: the filters and the sort, the page is not saved */
  radioQuery: radioQuerySchema,
};

export type PersistedSettings = z.infer<z.ZodObject<typeof persistedShape>>;
export type LibraryView = z.infer<typeof libraryViewSchema>;
export type OnlineView = z.infer<typeof onlineViewSchema>;

/** The keys of the saved settings that are valid: a key of the wrong type (a hand edit, a newer version) is left out and keeps its default, the others are restored */
const keepValidKeys = (saved: unknown) =>
  typeof saved === 'object' && saved !== null
    ? Object.fromEntries(
        Object.entries(persistedShape).flatMap(([key, schema]) =>
          key in saved && schema.safeParse(Reflect.get(saved, key)).success ? [[key, Reflect.get(saved, key)]] : []
        )
      )
    : {};

export const restoredSettingsSchema = z.preprocess(keepValidKeys, z.object(persistedShape).partial());
