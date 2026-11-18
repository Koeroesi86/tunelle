import { localUrl } from '../services/local-url';

const coverNameOf = (picture: string) => (picture.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');

/** The URL of the optimized cover the local server generates for a stored album picture */
export const getCoverUrl = (picture: string) => localUrl(`/albumart/${encodeURIComponent(coverNameOf(picture))}-optimized.png`);

/** The name of the optimized cover file in the album art folder, which the host serves to a listener by this name */
export const optimizedCoverOf = (picture: string) => `${coverNameOf(picture)}-optimized.png`;

/** The art the local server holds for the song a station is playing */
export const getRadioArtUrl = (art: string) => localUrl(`/radio-art/${art}`);

export const getRadioLogoUrl = (uuid: string) => localUrl(`/radio-logo/${encodeURIComponent(uuid)}`);
