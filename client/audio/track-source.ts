import type { Track } from '@shared/types/library';
import { localUrl } from '../services/local-url';
import { isSourcePath } from '../domain/source-track';
import { radioUuidOf } from '../domain/radio-track';
import { remoteKeyOf } from '../domain/remote-track';

/** The address an audio element plays a track from: a station through the local protocol, a file by its path */
export const sourceOf = (track: Track) => {
  const station = radioUuidOf(track.path);
  if (station) return localUrl(`/radio/${encodeURIComponent(station)}`);

  if (isSourcePath(track.path)) return localUrl(`/source/audio?${new URLSearchParams({ path: track.path, ...(track.codec ? { codec: track.codec } : {}) })}`);

  const remote = remoteKeyOf(track.path);
  if (remote !== undefined) return localUrl(`/remote/audio?t=${remote}`);

  return /^http/.test(track.path) ? track.path : localUrl(`/track?path=${encodeURIComponent(track.path)}`);
};

let connections = 0;

/** What an element is given to load. Chromium plays a stream that ended again from its cache, so each connection of a station has an address of its own. See docs/app/playback-failures.md */
export const loadAddressOf = (track: Track) => {
  if (radioUuidOf(track.path) === undefined) return sourceOf(track);

  connections += 1;
  return `${sourceOf(track)}?connection=${connections}`;
};

export const isFileTrack = (track: Track | null): track is Track =>
  track !== null && radioUuidOf(track.path) === undefined && !isSourcePath(track.path) && remoteKeyOf(track.path) === undefined;
