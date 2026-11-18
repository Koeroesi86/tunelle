import { z } from 'zod';
import { CONTROLS } from '../../shared/constants/remote-controls';
import { hostFields } from './host-store';

// what the page asks of the host; a message of the wrong shape is dropped (electron/utils/parse-payload.ts)

/** A change of the settings: only the parts that were sent, each of them valid */
export const hostChangeSchema = z.strictObject(hostFields).partial();

export const deviceDecisionSchema = z.object({
  deviceId: z.uuid(),
  action: z.enum(['approve', 'deny', 'revoke', 'block']),
});

export const deviceControlsSchema = z.object({
  deviceId: z.uuid(),
  controls: z.array(z.enum(CONTROLS)),
});
