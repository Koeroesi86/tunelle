import { isSourcePath } from '../domain/source-track';

const coverNameOf = (picture: string) => (picture.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');

/** The route of the optimized cover the local server generates for a stored album picture, or of the cover of a server (`<source>:<serverId>:<id>`) */
export const coverRouteOf = (picture: string) =>
  isSourcePath(picture) ? `/source/cover?path=${encodeURIComponent(picture)}` : `/albumart/${encodeURIComponent(coverNameOf(picture))}-optimized.png`;

/** The name of the optimized cover file in the album art folder, which the host serves to a listener by this name */
export const optimizedCoverOf = (picture: string) => `${coverNameOf(picture)}-optimized.png`;

/** The route of the art the local server holds for the song a station is playing */
export const radioArtRouteOf = (art: string) => `/radio-art/${art}`;

export const radioLogoRouteOf = (uuid: string) => `/radio-logo/${encodeURIComponent(uuid)}`;
