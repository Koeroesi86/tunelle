import { z } from 'zod';
import { CONTROLS } from '../constants/remote-controls';
import { MAX_LISTENERS } from '../constants/remote-limits';

/** What the host reports to the settings: its settings, whether it listens, who waits for an answer and who was approved. See docs/app/remote-access-discovery.md */
export const remoteHostStateSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  loopbackOnly: z.boolean(),
  maxListeners: z.number().int().min(1).max(MAX_LISTENERS),
  port: z.number().optional(),
  running: z.boolean(),
  /** The addresses that other devices connect to while it listens: the ones of the networks, or the loopback one */
  addresses: z.array(z.string()),
  /** The short code of the certificate, which the listener shows too */
  code: z.string().optional(),
  error: z.string().optional(),
  pending: z.array(z.object({ deviceId: z.uuid(), deviceName: z.string(), note: z.string(), at: z.number() })),
  devices: z.array(z.object({ id: z.uuid(), name: z.string(), blocked: z.boolean(), controls: z.array(z.enum(CONTROLS)) })),
});
export type RemoteHostState = z.infer<typeof remoteHostStateSchema>;
