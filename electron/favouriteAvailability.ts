import type { Database } from 'sqlite3';
import type { FavouriteKey } from '../types/favourites';
import type { RadioBrowser } from './radioBrowser';
import { findTrackFormat, findTrackPath, getAlbumTracks } from './libraryRepository';
import { isRecord } from '../shared/utils/is-record';

/** What tells whether an item is available: where it comes from and what it looked like */
type Keyed = FavouriteKey & { snapshot: unknown };

interface AvailabilityContext {
  database: Database;
  radio: Pick<RadioBrowser, 'findStations'>;
}

/** The items of one source and kind that the source no longer has */
type MissingFinder = (favourites: Keyed[], context: AvailabilityContext) => Promise<Keyed[]>;

const hasTracks = async ({ snapshot }: Keyed, { database }: AvailabilityContext) =>
  isRecord(snapshot) && typeof snapshot.path === 'string' && typeof snapshot.title === 'string'
    ? (await getAlbumTracks(database, snapshot.path, snapshot.title, ['path'])).length > 0
    : false;

const missingTracks: MissingFinder = async (favourites, { database }) =>
  (await Promise.all(favourites.map(async ({ id }) => (await findTrackPath(database, id)) === undefined))).flatMap((missing, index) =>
    missing ? [favourites[index]] : []
  );

const missingAlbums: MissingFinder = async (favourites, context) =>
  (await Promise.all(favourites.map((favourite) => hasTracks(favourite, context)))).flatMap((found, index) => (found ? [] : [favourites[index]]));

// a directory that does not answer says nothing about the stations, so none of them is reported missing
const missingStations: MissingFinder = async (favourites, { radio }) =>
  radio
    .findStations(favourites.map(({ id }) => id))
    .then((stations) => favourites.filter(({ id }) => !stations.some(({ uuid }) => uuid === id)))
    .catch(() => []);

/** A new source is a new entry here; a favourite of a source that is not listed is taken as available, because nothing can tell */
const missingFinders: Record<string, MissingFinder> = {
  'local/track': missingTracks,
  'local/album': missingAlbums,
  'radio/station': missingStations,
};

const typeOf = ({ source, kind }: Keyed) => `${source}/${kind}`;

/** The snapshot of a track with the format the library reads of it now, as the snapshot was saved before the format was read; any other snapshot is as it was */
const withFormat = async ({ source, kind, id, snapshot }: Keyed, { database }: AvailabilityContext) =>
  source === 'local' && kind === 'track' && isRecord(snapshot) ? { ...snapshot, ...(await findTrackFormat(database, id)) } : snapshot;

/** The favourites or the history items, each with whether its source still has it */
export const withAvailability = async <T extends Keyed>(favourites: T[], context: AvailabilityContext) => {
  const missing = (
    await Promise.all(
      [...new Set(favourites.map(typeOf))].map(
        (type) =>
          missingFinders[type]?.(
            favourites.filter((favourite) => typeOf(favourite) === type),
            context
          ) ?? []
      )
    )
  ).flat();

  return Promise.all(
    favourites.map(async (favourite) => ({
      ...favourite,
      snapshot: await withFormat(favourite, context),
      available: !missing.includes(favourite),
    }))
  );
};
