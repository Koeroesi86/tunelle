import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const optimizing = new Map<string, Promise<void>>();

const exists = (filePath: string) =>
  fs.promises.access(filePath).then(
    () => true,
    () => false
  );

/** Resize the album art into the optimized file; requests for the same file share one run and never see a half written file */
const optimizeAlbumArt = (source: string, target: string) => {
  const running = optimizing.get(target);
  if (running) return running;

  const partial = `${target}.part`;
  const job = sharp(source)
    .resize(250, 250, { fit: 'inside' })
    .png({ compressionLevel: 9, force: true })
    .toFile(partial)
    .then(() => fs.promises.rename(partial, target))
    .then(() => undefined)
    .finally(() => optimizing.delete(target));
  optimizing.set(target, job);
  return job;
};

/** The stored album art of a request; the optimized copy is generated from the original when it does not exist yet */
export const resolveAlbumArt = async (basename: string) => {
  const folder = path.join(global._appDataPath, './albumart/');
  const current = path.join(folder, basename);
  if (await exists(current)) return current;
  if (!/-optimized/.test(basename)) return undefined;

  const fileName = basename.replace(/-optimized/, '').replace(path.extname(basename), '');
  const files = await fs.promises.readdir(folder);
  const original = files.find((file) => file.indexOf(fileName) === 0 && !file.includes('-optimized') && !file.endsWith('.part'));
  if (!original) return undefined;

  await optimizeAlbumArt(path.join(folder, original), current);
  return current;
};
