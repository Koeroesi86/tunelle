import { net } from 'electron';
import { toImage } from './radio-art';
import type { RadioArtImage } from './radio-art';

const maxLogos = 300;
const logoTimeout = 8000;

// net.fetch keeps the logo on disk, where Node's fetch has no cache. See docs/app/radio-logos.md
const ask = (url: string, cache: 'force-cache' | 'reload') => net.fetch(url, { cache, credentials: 'omit', signal: AbortSignal.timeout(logoTimeout) });

/** The stored copy of a logo, however old; a stored answer that is no image (an error is stored too) is asked for again */
const getLogo = async (url: string) => toImage(await ask(url, 'force-cache')).catch(async () => toImage(await ask(url, 'reload')));

/**
 * The logos of the stations the page shows: the image at the address the directory lists for a station.
 * The answer is kept for the run (also when there is none), so a logo that does not load is not asked for again; the oldest are dropped past a limit.
 */
export const createRadioLogos = (logoUrlOf: (uuid: string) => Promise<string | undefined>) => {
  const logos = new Map<string, Promise<RadioArtImage | undefined>>();

  const keep = (uuid: string, url: string) => {
    const logo = getLogo(url).catch(() => undefined);
    logos.set(uuid, logo);
    if (logos.size > maxLogos) logos.delete(logos.keys().next().value ?? '');
    return logo;
  };

  return {
    get: async (uuid: string) => {
      const url = logos.has(uuid) ? undefined : await logoUrlOf(uuid);
      // looked up again, as the page may have asked for the same station while its address was read
      return logos.get(uuid) ?? (url ? keep(uuid, url) : undefined);
    },
  };
};
