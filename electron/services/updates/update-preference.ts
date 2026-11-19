import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';

// the preference is read before the splash, and the library, where the settings live, opens after it
const getFile = (folder: string) => resolve(folder, './update-preference.json');

// the updates are on and a metered connection asks first, unless the user chose otherwise; a value that is not a boolean counts as not chosen
const preferenceSchema = z
  .object({ automatic: z.boolean().catch(true), allowMetered: z.boolean().catch(false) })
  .catch({ automatic: true, allowMetered: false });

export type UpdatePreference = z.infer<typeof preferenceSchema>;

/** What the user chose about the updates, the defaults also when the file is missing or unreadable */
export const readUpdatePreference = (folder: string): UpdatePreference => {
  try {
    return preferenceSchema.parse(JSON.parse(readFileSync(getFile(folder), 'utf8')));
  } catch {
    return preferenceSchema.parse(undefined);
  }
};

/** Keeps one choice and leaves the other as it was */
export const saveUpdatePreference = (folder: string, change: Partial<UpdatePreference>) =>
  mkdir(folder, { recursive: true }).then(() => writeFile(getFile(folder), JSON.stringify({ ...readUpdatePreference(folder), ...change })));
