import { z } from 'zod';

const flag = z.boolean().optional().catch(undefined);

/** When the app saves power: `auto` follows the power source of the computer, `always` and `never` ignore it. See docs/app/power-saving.md */
export const powerSavingModeSchema = z.enum(['auto', 'always', 'never']);
export type PowerSavingMode = z.infer<typeof powerSavingModeSchema>;
export const defaultPowerSavingMode: PowerSavingMode = 'auto';

/** The keys of the saved settings that the main process reads; a key of another type is none, and the rest of the settings is not its business */
const mainSettingsSchema = z.object({
  language: z.string().optional().catch(undefined),
  theme: z
    .object({ mode: z.enum(['light', 'dark']).optional().catch(undefined) })
    .optional()
    .catch(undefined),
  desktopBlur: flag,
  watchFolders: flag,
  measureLoudness: flag,
  notifyLibraryChanges: flag,
  powerSaving: powerSavingModeSchema.optional().catch(undefined),
});

/** The settings as the main process reads them, every key undefined for anything that is not a settings object */
export const readMainSettings = (settings: unknown) => mainSettingsSchema.safeParse(settings).data ?? mainSettingsSchema.parse({});
