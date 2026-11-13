import { z } from 'zod';
import { maxPrioritisedTracks } from '../constants/loudness';
import { groupSummarySchema } from './library';

// what the page asks of the main process, by the shape of the message; a message of the wrong shape is dropped (electron/utils/parse-payload.ts)
// the readers that never refuse (the `catch`) are for messages where a part that is wrong is left out and the rest is done

const maxArtistNames = 200;

const addedFileSchema = z.object({ path: z.string(), lastModified: z.number() });

/** The files that were dropped or picked: the entries that are not a path with a modification time are left out */
export const addedFilesSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) => items.flatMap((item) => addedFileSchema.safeParse(item).data ?? []));

export const folderTargetSchema = z.string();

/** A rescan is forced only by a message that says so */
export const rescanRequestSchema = z
  .object({ forced: z.literal(true) })
  .transform(() => true)
  .catch(false);

/** The tracks that were queued or started: measured before the rest of the library, the first ones only */
export const prioritiseLoudnessSchema = z.object({ paths: z.array(z.string()).transform((paths) => paths.slice(0, maxPrioritisedTracks)) });

/** A switch in the settings: the launcher entry, the automatic updates */
export const enabledRequestSchema = z.object({ enabled: z.boolean() });

const artistNameSchema = groupSummarySchema.pick({ key: true, name: true });

/** The names to look the photos of up, the ones that are not a key with a name are left out, and a request holds only so many */
export const artistNamesSchema = z
  .object({ artists: z.array(z.unknown()) })
  .transform(({ artists }) => artists.flatMap((item) => artistNameSchema.safeParse(item).data ?? []).slice(0, maxArtistNames))
  .catch([]);

/** A change of the photo of one name: a file the user picks, no photo (the cover of an album shows), the lookup again, or a search result */
const photoKeySchema = z.string().min(1);

// a picture to download is one of the search results, which are on the servers of Deezer
const deezerPictureSchema = z.url({ protocol: /^https$/ }).refine((url) => new URL(url).hostname.endsWith('.dzcdn.net'));

export const artistPhotoChangeSchema = z.discriminatedUnion('change', [
  z.object({ key: photoKeySchema, change: z.enum(['pick', 'remove', 'reset']) }),
  z.object({ key: photoKeySchema, change: z.literal('download'), picture: deezerPictureSchema }),
]);

/** The text to search the photos of artists by on Deezer */
export const artistPhotoSearchSchema = z.object({ query: z.string().trim().min(1).max(100) });

/** The settings as the page saves them: what is in them is read key by key by whoever needs it (shared/schemas/settings.ts) */
export const savedSettingsSchema = z.record(z.string(), z.unknown());
