import { z } from 'zod';

const maxFieldLength = 2000;

const field = z.string().min(1).max(maxFieldLength);

/** What is favourited: the source it comes from ('local', 'radio', later a mounted drive or another service), what it is in that source and its id there */
export const favouriteKeySchema = z.object({ source: field, kind: field, id: field });

/** The message that adds a favourite or records a played item: the key, and the snapshot kept to show it when its source no longer has it */
export const snapshotPayloadSchema = favouriteKeySchema.extend({ snapshot: z.record(z.string(), z.unknown()) });

/** A favourite as the main process stores it, any source, with the snapshot as it was saved */
export const storedFavouriteSchema = favouriteKeySchema.extend({ snapshot: z.unknown(), addedAt: z.number() });

/** An item of the history as the main process stores it, any source, with the snapshot as it was saved */
export const storedHistoryItemSchema = favouriteKeySchema.extend({ snapshot: z.unknown(), playedAt: z.number() });

export type StoredFavourite = z.infer<typeof storedFavouriteSchema>;
export type StoredHistoryItem = z.infer<typeof storedHistoryItemSchema>;
export type FavouriteKey = z.infer<typeof favouriteKeySchema>;
