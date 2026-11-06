import type { Database } from 'sqlite3';
import { analysisVersion } from '@shared/constants/loudness';
import { poolAlbum } from '@shared/utils/pool-loudness';
import { findAlbumsToPool, getAlbumAnalyses, saveAlbumGain } from '../../repositories/loudness-repository';
import type { AlbumToPool } from '../../repositories/loudness-repository';

/** An album whose tracks all have their analysis gets the gain pooled from them, and one that lost a track's analysis loses it (the tracks fall back to their own gain) */
const settleAlbum = async (database: Database, album: AlbumToPool) => {
  const analyses = await getAlbumAnalyses(database, album, analysisVersion);
  const paths = analyses.map(({ path }) => path);
  if (!album.complete) return saveAlbumGain(database, paths, undefined, null);

  return saveAlbumGain(database, paths, poolAlbum(analyses.map(({ analysis }) => analysis)), album.tracks);
};

/**
 * Gives the albums of the library the gain of their stored analyses, no track is decoded. See docs/app/loudness-measurement.md
 * Answers how many albums it settled; a stop leaves the rest for the next time
 */
export const poolAlbumGains = async (database: Database, signal: AbortSignal) => {
  const albums = await findAlbumsToPool(database, analysisVersion);
  const settleFrom = async (index: number): Promise<number> => {
    if (index >= albums.length || signal.aborted) return index;
    await settleAlbum(database, albums[index]);
    return settleFrom(index + 1);
  };
  return settleFrom(0);
};
