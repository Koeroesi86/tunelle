import { z } from 'zod';
import { storedFavouriteSchema, storedHistoryItemSchema } from '@shared/schemas/favourites';
import { folderSchema } from '@shared/schemas/folders';
import { foldersRowSchema } from './database/folders';
import { favouritesRowSchema } from './database/favourites';
import { historyRowSchema } from './database/history';
import { playlistsRowSchema } from './database/playlists';
import { playlistTracksRowSchema } from './database/playlist-tracks';

/** A column of JSON text, read as the value in it */
export const json = z.string().transform((text, context) => {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    context.issues.push({ code: 'custom', message: 'Not valid JSON', input: text });
    return z.NEVER;
  }
});

/** A column of JSON text, read as the value in it and checked against the schema */
export const jsonOf = <S extends z.ZodType>(schema: S) => json.pipe(schema);

// the columns come from the table, what the app takes of them (the snapshot as a value, the camel case names, the limits of the key) is added here
export const favouriteRowSchema = favouritesRowSchema
  .extend({ snapshot: json })
  .transform(({ added_at, ...row }) => ({ ...row, addedAt: added_at }))
  .pipe(storedFavouriteSchema);

export const historyItemRowSchema = historyRowSchema
  .extend({ snapshot: json })
  .transform(({ played_at, ...row }) => ({ ...row, playedAt: played_at }))
  .pipe(storedHistoryItemSchema);

// the columns come from the table, a NULL modification time is read as 0
export const folderRowSchema = foldersRowSchema.extend(folderSchema.shape);

export const playlistRowSchema = playlistsRowSchema.pick({ id: true, name: true });

export const playlistEntryRowSchema = playlistTracksRowSchema.pick({ id: true, playlist_id: true, path: true }).extend({ snapshot: json });

export const idRowSchema = playlistsRowSchema.pick({ id: true });
