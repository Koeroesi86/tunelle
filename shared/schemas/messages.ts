import { z } from 'zod';
import { backgroundTasksSchema } from './background-tasks';
import { folderSchema } from './folders';
import { failedLoudnessTrackSchema, loudnessProgressSchema } from './loudness';
import { radioOptionKindSchema, radioOptionSchema, radioStationSchema, radioTagSchema } from './radio';
import { updateStateSchema } from './update';
import { radioSearchSchema } from '../types/radio-query';

// what the main process sends to the page, by channel; a message of the wrong shape is dropped by the page (client/services/on-message.ts)
const radioStreamSchema = radioStationSchema.pick({ uuid: true });

export const messageSchemas = {
  STORE_FOLDERS: z.object({ folders: z.array(folderSchema) }),
  FOLDERS_ADDED_TO_LIBRARY: z.object({ folders: z.array(folderSchema) }),
  OFFLINE_FOLDERS: z.object({ folders: z.array(z.string()) }),
  LOUDNESS_STATUS: loudnessProgressSchema,
  LOUDNESS_FAILED: z.object({ tracks: z.array(failedLoudnessTrackSchema) }),
  BACKGROUND_TASKS: backgroundTasksSchema,
  MAXIMIZED_APP: z.object({ maximized: z.boolean() }),
  SET_PLAYING: z.object({ isPlaying: z.boolean() }),
  LAUNCHER_STATE: z.object({ available: z.boolean(), enabled: z.boolean(), offered: z.boolean(), external: z.boolean() }),
  UPDATE_STATE: updateStateSchema,
  CLICKED_URL: z.object({ playlist: z.array(z.object({ file: z.string(), title: z.string().optional() })), url: z.string() }),
  SCANNING_FILE: z.object({ fileName: z.string(), progress: z.number(), totalCount: z.number() }),
  SCANNING_FOLDER: z.object({ folder: z.string() }),
  RADIO_STATIONS: z.object({ query: radioSearchSchema, stations: z.array(radioStationSchema), hasMore: z.boolean().optional(), error: z.string().optional() }),
  RADIO_TAGS_LOADED: z.object({ tags: z.array(radioTagSchema) }),
  RADIO_OPTIONS_LOADED: z.object({ kind: radioOptionKindSchema, options: z.array(radioOptionSchema) }),
  RADIO_STREAM_TITLE: radioStreamSchema.extend({ title: z.string() }),
  RADIO_STREAM_RATE: radioStreamSchema.extend({ sampleRate: z.number() }),
  RADIO_STREAM_ART: radioStreamSchema.extend({ title: z.string(), art: z.string().optional() }),
  // the items of these are checked one by one by the page, which leaves out the ones it cannot show (saved by a newer version)
  FAVOURITES: z.object({ favourites: z.array(z.unknown()) }),
  HISTORY: z.object({ history: z.array(z.unknown()) }),
  PLAYLISTS: z.object({ playlists: z.array(z.unknown()) }),
};

/** The channels whose message has no content */
export const emptyMessage = z.record(z.string(), z.never());
