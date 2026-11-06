import { z } from 'zod';

const flag = z.boolean().optional().catch(undefined);

/** The keys of the saved settings that the main process reads; a key of another type is none, and the rest of the settings is not its business */
const mainSettingsSchema = z.object({
  language: z.string().optional().catch(undefined),
  theme: z
    .object({ mode: z.enum(['light', 'dark']).optional().catch(undefined) })
    .optional()
    .catch(undefined),
  watchFolders: flag,
  measureLoudness: flag,
});

/** The settings as the main process reads them, every key undefined for anything that is not a settings object */
export const readMainSettings = (settings: unknown) => mainSettingsSchema.safeParse(settings).data ?? mainSettingsSchema.parse({});
