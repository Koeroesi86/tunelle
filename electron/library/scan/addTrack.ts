import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import { addTracks } from './addTracks';

function addTrack(database: Database, track: Track) {
  return addTracks(database, [track]);
}

export default addTrack;
