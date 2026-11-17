import { z } from 'zod';
import type { Control } from './access';

/** What a listener may ask the host to do. `queue` is not here yet: it needs the library to be reachable by the listener */
export const controlCommandSchema = z.discriminatedUnion('control', [
  z.object({ control: z.literal('playPause'), action: z.enum(['play', 'pause', 'toggle']).default('toggle') }),
  z.object({ control: z.literal('skip'), direction: z.enum(['next', 'previous']) }),
  z.object({ control: z.literal('seek'), position: z.number().nonnegative() }),
  z.object({ control: z.literal('volume'), level: z.number().min(0).max(1) }),
]);
export type ControlCommand = z.infer<typeof controlCommandSchema>;

/** The permission a command needs; the host allows each one per device */
export const permissionOf = (command: ControlCommand): Control => command.control;
