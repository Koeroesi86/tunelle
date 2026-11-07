import { z } from 'zod';

const updateUnavailableReasonSchema = z.enum(['am', 'development', 'disabled', 'flatpak', 'macReadonly', 'managed', 'readonly', 'store', 'translocated']);

const updateStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('checking') }),
  z.object({ kind: z.literal('upToDate'), checkedAt: z.number() }),
  z.object({ kind: z.literal('downloading'), version: z.string(), percent: z.number() }),
  z.object({ kind: z.literal('ready'), version: z.string() }),
  z.object({ kind: z.literal('failed'), message: z.string() }),
]);

/** What the main process tells the settings about the installed app and its updates */
export const updateStateSchema = z.object({
  version: z.string(),
  electron: z.string(),
  chrome: z.string(),
  /** Why the app does not update itself, undefined where it does */
  unavailable: updateUnavailableReasonSchema.optional(),
  /** Whether the app checks for an update and installs it at start; the check in the settings works either way */
  automatic: z.boolean(),
  status: updateStatusSchema,
});

export type UpdateUnavailableReason = z.infer<typeof updateUnavailableReasonSchema>;
export type UpdateStatus = z.infer<typeof updateStatusSchema>;
export type UpdateState = z.infer<typeof updateStateSchema>;
