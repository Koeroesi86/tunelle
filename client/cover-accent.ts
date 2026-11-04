import { pickAccent, sampleSize } from './pick-accent';

const accents = new Map<string, Promise<string | undefined>>();

const readPixels = async (image: Blob) => {
  const bitmap = await createImageBitmap(image, { resizeWidth: sampleSize, resizeHeight: sampleSize });
  const context = new OffscreenCanvas(sampleSize, sampleSize).getContext('2d');
  if (!context) throw new Error('No canvas to read the cover with');

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, sampleSize, sampleSize).data;
};

/** The colour the main process stored for a cover of the library comes with it; a cover without one (not picked yet, or not of the library) is read here */
const readAccent = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The cover answered ${response.status}`);

  const stored = response.headers.get('X-Cover-Accent');
  return stored === null ? pickAccent(await readPixels(await response.blob())) : stored || undefined;
};

/** The accent of the cover at the URL, picked once per cover; undefined when the cover is missing, unreadable or grey */
export const coverAccent = (url: string): Promise<string | undefined> => {
  const known = accents.get(url);
  if (known) return known;

  const picked = readAccent(url).catch(() => undefined);
  accents.set(url, picked);
  return picked;
};
