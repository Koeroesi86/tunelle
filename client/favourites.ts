import type { Favourite, FavouriteKey, NewFavourite } from '../types/favourites';
import type { Album, AlbumSummary, Track } from '../types/library';
import type { RadioStation } from '../types/radio';
import { radioUuidOf } from './utils/radio-track';
import { isRecord } from '@shared/utils/is-record';

const hasText = (value: unknown, fields: string[]) => isRecord(value) && fields.every((field) => typeof value[field] === 'string');

// what the player can show of each kind of favourite, a favourite of another source (saved by a newer version) is left out
const snapshotFields: Record<string, string[]> = {
  'local/track': ['path'],
  'local/album': ['id', 'path', 'title'],
  'radio/station': ['uuid', 'name'],
};

/** An item the player knows how to show, a favourite or an item of the history, of a source this version knows */
export const isShowable = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  hasText(value, ['source', 'kind', 'id']) &&
  typeof value.available === 'boolean' &&
  `${value.source}/${value.kind}` in snapshotFields &&
  hasText(value.snapshot, snapshotFields[`${value.source}/${value.kind}`]);

export const isFavourite = (value: unknown): value is Favourite => isShowable(value) && typeof value.addedAt === 'number';

export const isSameFavourite = (a: FavouriteKey, b: FavouriteKey) => a.source === b.source && a.kind === b.kind && a.id === b.id;

export const isFavourited = (favourites: Favourite[], key: FavouriteKey) => favourites.some((favourite) => isSameFavourite(favourite, key));

export const stationFavourite = (station: RadioStation): NewFavourite => ({ source: 'radio', kind: 'station', id: station.uuid, snapshot: station });

export const albumFavourite = (album: AlbumSummary | Album): NewFavourite => {
  const { id, title, path, artist, cover, duration, year } = album;

  return {
    source: 'local',
    kind: 'album',
    id,
    snapshot: { id, title, path, artist, cover, duration, year, trackCount: 'tracks' in album ? album.tracks.length : album.trackCount },
  };
};

/** The station a radio track plays: the one played last, or what the track knows of it */
const stationOfTrack = (track: Track, uuid: string, playing?: RadioStation): RadioStation =>
  playing?.uuid === uuid ? playing : { uuid, name: track.title, country: '', tags: [], codec: '', bitrate: 0 };

/** The favourite of a track the player plays, a radio station or a track of the library */
export const trackFavourite = (track: Track, playing?: RadioStation): NewFavourite => {
  const uuid = radioUuidOf(track.path);

  return uuid ? stationFavourite(stationOfTrack(track, uuid, playing)) : { source: 'local', kind: 'track', id: track.path, snapshot: track };
};
