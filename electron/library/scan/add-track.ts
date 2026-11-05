import type { Database } from 'sqlite3';
import type { Track } from '@shared/types/library';
import { addTracks } from './add-tracks';

function addTrack(database: Database, track: Track) {
  return addTracks(database, [track]);
}

export default addTrack;
