import { getImage } from './services/radioArt';
import type { RadioArtImage } from './services/radioArt';

const maxLogos = 300;

/**
 * The logos of the stations the page shows: the image at the address the directory lists for a station, fetched once.
 * The answer is kept (also when there is none), so a logo that does not load is not asked for again; the oldest are dropped past a limit.
 */
export const createRadioLogos = (logoUrlOf: (uuid: string) => string | undefined) => {
  const logos = new Map<string, Promise<RadioArtImage | undefined>>();

  return {
    get: (uuid: string) => {
      const known = logos.get(uuid);
      if (known) return known;

      const url = logoUrlOf(uuid);
      if (!url) return Promise.resolve(undefined);

      const logo = getImage(url).catch(() => undefined);
      logos.set(uuid, logo);
      if (logos.size > maxLogos) logos.delete(logos.keys().next().value ?? '');
      return logo;
    },
  };
};
