import { localUrl } from '../services/local-url';

/** The URL of the optimized cover the local server generates for a stored album picture */
export const getCoverUrl = (picture: string) => {
  const cover = (picture.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');
  return localUrl(`/albumart/${encodeURIComponent(cover)}-optimized.png`);
};

/** The art the local server holds for the song a station is playing */
export const getRadioArtUrl = (art: string) => localUrl(`/radio-art/${art}`);

export const getRadioLogoUrl = (uuid: string) => localUrl(`/radio-logo/${encodeURIComponent(uuid)}`);
