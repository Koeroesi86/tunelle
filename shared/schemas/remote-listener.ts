import { z } from 'zod';
import { CONTROLS } from '../constants/remote-controls';
import { nowPlayingSchema } from './now-playing';

const LISTENER_STATUSES = ['idle', 'contacting', 'confirming', 'waiting', 'listening', 'revoked', 'blocked', 'error'] as const;

/** What the listener side reports to the page: where it is in pairing with a host and what the host plays. See docs/app/remote-access-discovery.md */
export const remoteListenerStateSchema = z.object({
  status: z.enum(LISTENER_STATUSES),
  target: z.object({ host: z.string(), port: z.number() }).optional(),
  /** The short code of the certificate of the host, to compare with the one the host shows */
  code: z.string().optional(),
  nowPlaying: nowPlayingSchema.optional(),
  /** What the host lets this device control; the buttons shown are these */
  controls: z.array(z.enum(CONTROLS)).optional(),
  error: z.string().optional(),
});
export type RemoteListenerState = z.infer<typeof remoteListenerStateSchema>;
