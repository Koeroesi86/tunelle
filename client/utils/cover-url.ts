import { localUrl } from '../services/local-url';
import { isSourcePath } from '../domain/source-track';

const coverNameOf = (picture: string) => (picture.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');

/** The URL of the optimized cover the local server generates for a stored album picture, or of the cover of a server (`<source>:<serverId>:<id>`) */
export const getCoverUrl = (picture: string) =>
  isSourcePath(picture)
    ? localUrl(`/source/cover?path=${encodeURIComponent(picture)}`)
    : localUrl(`/albumart/${encodeURIComponent(coverNameOf(picture))}-optimized.png`);

/** The name of the optimized cover file in the album art folder, which the host serves to a listener by this name */
export const optimizedCoverOf = (picture: string) => `${coverNameOf(picture)}-optimized.png`;

/** The art the local server holds for the song a station is playing */
export const getRadioArtUrl = (art: string) => localUrl(`/radio-art/${art}`);

export const getRadioLogoUrl = (uuid: string) => localUrl(`/radio-logo/${encodeURIComponent(uuid)}`);
