import type { Track } from '../../types/library';
import { localUrl } from '../services/local-url';
import { radioUuidOf } from '../utils/radio-track';

/** The address an audio element plays a track from: a station through the local protocol, a file by its path */
export const sourceOf = (track: Track) => {
  const station = radioUuidOf(track.path);
  if (station) return localUrl(`/radio/${encodeURIComponent(station)}`);

  return /^http/.test(track.path) ? track.path : localUrl(`/track?path=${encodeURIComponent(track.path)}`);
};

export const isFileTrack = (track: Track | null): track is Track => track !== null && radioUuidOf(track.path) === undefined;
