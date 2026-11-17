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
  }),
]);
export type NowPlaying = z.infer<typeof nowPlayingSchema>;
