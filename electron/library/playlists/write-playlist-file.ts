import { randomUUID } from 'crypto';
import fs from 'fs';

/** The first write over a file that was there keeps what was in it next to it as `<file>.bak`, never over an earlier one */
const keepBackup = (filePath: string) =>
  fs.promises.copyFile(filePath, `${filePath}.bak`, fs.constants.COPYFILE_EXCL).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error;
  });

/** The bytes go to a file beside the target and replace it in one step, so a reader sees the old file or the new one and a failed write leaves the old one. Returns the modification time of the file, in whole milliseconds. See docs/app/playlist-export.md */
export const writePlaylistFile = async (filePath: string, buffer: Buffer, backup: boolean) => {
  const temporary = `${filePath}.${randomUUID()}.tmp`;

  await (backup ? keepBackup(filePath) : Promise.resolve());
  await fs.promises
    .writeFile(temporary, buffer)
    .then(() => fs.promises.rename(temporary, filePath))
    .catch((error: unknown) => fs.promises.rm(temporary, { force: true }).then(() => Promise.reject(error)));

  return Math.floor((await fs.promises.stat(filePath)).mtimeMs);
};
