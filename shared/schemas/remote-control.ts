import { z } from 'zod';

/** What a listener may ask the host to do. There is no `queue`: a listener does not add to the queue of the host */
export const controlCommandSchema = z.discriminatedUnion('control', [
  z.object({ control: z.literal('playPause'), action: z.enum(['play', 'pause', 'toggle']).default('toggle') }),
  z.object({ control: z.literal('skip'), direction: z.enum(['next', 'previous']) }),
  z.object({ control: z.literal('seek'), position: z.number().nonnegative() }),
  z.object({ control: z.literal('volume'), level: z.number().min(0).max(1) }),
]);
export type ControlCommand = z.infer<typeof controlCommandSchema>;
