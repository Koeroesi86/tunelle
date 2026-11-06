import { z } from 'zod';

const maxNameLength = 200;

const id = z.number().int();

const name = z
  .string()
  .transform((value) => value.trim().slice(0, maxNameLength))
  .pipe(z.string().min(1));

const track = z.looseObject({ path: z.string().min(1) });

/** The tracks of a renderer message, anything that is not a track with a path is dropped */
const tracks = z
  .array(z.unknown())
  .default([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = track.safeParse(item);
      return parsed.success ? [{ path: parsed.data.path, snapshot: item }] : [];
    })
  );

export const playlistCreateSchema = z.object({ name, tracks });
export const playlistRenameSchema = z.object({ id, name });
export const playlistIdSchema = z.object({ id });
export const playlistMoveSchema = z.object({ id, toIndex: id });
export const playlistAddSchema = z.object({ id, tracks });
export const playlistEntrySchema = z.object({ id, entryId: id });
export const playlistMoveEntrySchema = z.object({ id, entryId: id, toIndex: id });

/** A playlist as the main process stores it, the snapshots are as they were saved */
export const storedPlaylistSchema = z.object({
  id,
  name: z.string(),
  entries: z.array(z.object({ id, path: z.string(), snapshot: z.unknown() })),
});

export type StoredPlaylist = z.infer<typeof storedPlaylistSchema>;
