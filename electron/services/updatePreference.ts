import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';

// the preference is read before the splash, and the library, where the settings live, opens after it
const getFile = (folder: string) => resolve(folder, './update-preference.json');

const isOff = (value: unknown) => typeof value === 'object' && value !== null && 'automatic' in value && value.automatic === false;

/** Whether the app updates itself at start: on unless the user turned it off, also when the file is missing or unreadable */
export const readAutomaticUpdates = (folder: string): boolean => {
  try {
    return !isOff(JSON.parse(readFileSync(getFile(folder), 'utf8')));
  } catch {
    return true;
  }
};

export const saveAutomaticUpdates = (folder: string, automatic: boolean) =>
  mkdir(folder, { recursive: true }).then(() => writeFile(getFile(folder), JSON.stringify({ automatic })));
