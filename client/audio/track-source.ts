import type { Track } from '@shared/types/library';
import { localUrl } from '../services/local-url';
import { isSourcePath } from '../domain/source-track';
import { radioUuidOf } from '../domain/radio-track';
import { remoteKeyOf } from '../domain/remote-track';

/** The address an audio element plays a track from: a station through the local protocol, a file by its path */
export const sourceOf = (track: Track) => {
  const station = radioUuidOf(track.path);
  if (station) return localUrl(`/radio/${encodeURIComponent(station)}`);

  if (isSourcePath(track.path))
    return localUrl(
      `/source/audio?${new URLSearchParams({ path: track.path, ...(track.codec ? { codec: track.codec } : {}), ...(track.bitDepth ? { bitDepth: String(track.bitDepth) } : {}) })}`
    );

  const remote = remoteKeyOf(track.path);
  if (remote !== undefined) return localUrl(`/remote/audio?t=${remote}`);

  return /^http/.test(track.path) ? track.path : localUrl(`/track?path=${encodeURIComponent(track.path)}`);
};

export const isFileTrack = (track: Track | null): track is Track =>
  track !== null && radioUuidOf(track.path) === undefined && !isSourcePath(track.path) && remoteKeyOf(track.path) === undefined;
