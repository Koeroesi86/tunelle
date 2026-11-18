import { z } from 'zod';

/** A Tunelle that host mode advertises on the local network, as the listener found it. Only the address and port are what to connect to; the host still asks to compare a code */
const nearbyHostSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number().int().min(1024).max(65535),
  version: z.string(),
});
export type NearbyHost = z.infer<typeof nearbyHostSchema>;

export const remoteNearbySchema = z.array(nearbyHostSchema);
