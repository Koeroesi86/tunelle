import type { Track } from '@shared/types/library';
import { getCoverUrl, getRadioArtUrl, getRadioLogoUrl } from './cover-url';
import { radioUuidOf } from './radio-track';

/** The stream title is usually `Artist - Title`, without the separator it is all the title */
export const splitStreamTitle = (streamTitle: string) => {
  const match = streamTitle.trim().match(/^(.+?) - (.+)$/);
  return match ? { artist: match[1].trim(), title: match[2].trim() } : { artist: '', title: streamTitle.trim() };
};

/** What the player shows of a track: a station shows the song on air with the station as its album, the others show themselves */
export const toNowPlaying = (track: Track, streamTitle: string | null, streamArt: string | null) => {
  const uuid = radioUuidOf(track.path);
  const onAir = streamTitle && uuid ? { ...track, ...splitStreamTitle(streamTitle), album: track.title, picture: null } : track;
  const stationCover = streamArt ? getRadioArtUrl(streamArt) : uuid && streamTitle ? getRadioLogoUrl(uuid) : undefined;
  const cover = stationCover ?? (onAir.picture ? getCoverUrl(onAir.picture) : undefined);

  return { track: onAir, cover };
};
