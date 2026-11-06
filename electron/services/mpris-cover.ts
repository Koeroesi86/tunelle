import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { extension } from 'mime-types';

/** The shell reads the cover from outside the sandbox: the Flatpak shares `$XDG_RUNTIME_DIR/app/<id>` with the host. See docs/app/mpris.md */
export const coverFolder = (runtimeDir: string | undefined, flatpakId: string | undefined) =>
  runtimeDir ? join(runtimeDir, flatpakId ? `app/${flatpakId}` : 'tunelle') : join(tmpdir(), 'tunelle-mpris');

/** One file at a time, under a new name for each cover (the shell keeps what it read under the old name), removed with the next one */
export const createCoverFiles = (folder: string) => {
  let counter = 0;
  let current: string | undefined;

  const clear = async () => {
    const old = current;
    current = undefined;
    if (old) await rm(old, { force: true });
  };

  const write = async (bytes: Uint8Array, type: string) => {
    const file = join(folder, `cover-${++counter}.${extension(type) || 'img'}`);
    await mkdir(folder, { recursive: true });
    await writeFile(file, bytes);
    const old = current;
    current = file;
    if (old) await rm(old, { force: true });

    return pathToFileURL(file).href;
  };

  return { write, clear };
};
