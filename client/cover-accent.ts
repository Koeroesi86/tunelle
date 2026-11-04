import { pickAccent, sampleSize } from './pick-accent';

const accents = new Map<string, Promise<string | undefined>>();

const readPixels = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The cover answered ${response.status}`);

  const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: sampleSize, resizeHeight: sampleSize });
  const context = new OffscreenCanvas(sampleSize, sampleSize).getContext('2d');
  if (!context) throw new Error('No canvas to read the cover with');

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, sampleSize, sampleSize).data;
};

/** The accent of the cover at the URL, picked once per cover; undefined when the cover is missing, unreadable or grey */
export const coverAccent = (url: string): Promise<string | undefined> => {
  const known = accents.get(url);
  if (known) return known;

  const picked = readPixels(url)
    .then(pickAccent)
    .catch(() => undefined);
  accents.set(url, picked);
  return picked;
};
