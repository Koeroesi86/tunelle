import type { Database } from 'sqlite3';
import type { Track } from '../types/library';
import executeQuery from './executeQuery';
import { toSortKeys } from './sortKey';

const columns = `path, artist, album, title, year, track, disk, genre, picture, duration, title_key, artist_key, album_key, album_artist_key, genre_key, albumArtist, codec, bitDepth, sampleRate, bitrate, vbr, lossless, trackGain, albumGain, trackPeak, albumPeak`;
const columnCount = columns.split(',').length;
const row = `(${Array.from({ length: columnCount }, () => '?').join(', ')})`;

// SQLite takes 32766 variables in a statement
export const maxBatchSize = Math.floor(32766 / columnCount);

const defaultBatchSize = 100;

/** How many tracks a scan stores in one write, from `TUNELLE_SCAN_BATCH_SIZE`; a value that is not a whole number from 1 up to what a statement takes is the default */
export const readBatchSize = (value = process.env.TUNELLE_SCAN_BATCH_SIZE) => {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= maxBatchSize ? size : defaultBatchSize;
};

const toValues = (track: Track) => [
  track.path,
  track.artist,
  track.album,
  track.title,
  track.year,
  track.track,
  track.disk,
  track.genre,
  track.picture,
  track.duration,
  ...toSortKeys(track),
  track.albumArtist ?? null,
  track.codec ?? null,
  track.bitDepth ?? null,
  track.sampleRate ?? null,
  track.bitrate ?? null,
  track.vbr ?? null,
  track.lossless ?? null,
  track.trackGain ?? null,
  track.albumGain ?? null,
  track.trackPeak ?? null,
  track.albumPeak ?? null,
];

/** Store the tracks with one statement, so the database syncs to the disk once for all of them instead of once for each, which is what a scan of a big library waits on, most on Windows; it is all or none */
export const addTracks = async (database: Database, tracks: Track[]) => {
  if (tracks.length === 0) return;
  await executeQuery(database, {
    query: `INSERT OR REPLACE INTO library (${columns}) VALUES ${tracks.map(() => row).join(', ')}`,
    variables: tracks.flatMap(toValues),
  });
};
