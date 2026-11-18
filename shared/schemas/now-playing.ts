import { z } from 'zod';

export const nowPlayingSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({
    state: z.enum(['playing', 'paused']),
    title: z.string(),
    artist: z.string().optional(),
    album: z.string().optional(),
    /** The position in seconds at `at` (milliseconds since the epoch), which the listener runs on from */
    position: z.number().nonnegative(),
    at: z.number(),
    duration: z.number().nonnegative().optional(),
    /** True when the host has a cover for this track, which `/remote/cover` serves; the file it comes from stays on the host */
    cover: z.boolean().optional(),
    /** The volume of the host between 0 and 1, which the volume slider of a listener with that control starts from */
    volume: z.number().min(0).max(1).optional(),
    /** The track that plays after this one, when there is one */
    next: z.object({ title: z.string(), artist: z.string().optional() }).optional(),
  }),
]);
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
