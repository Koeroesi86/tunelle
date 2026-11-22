import type { Track } from '@shared/types/library';
import { coverRouteOf } from '../utils/cover-url';
import { isSourcePath } from './source-track';
import type { NowPlaying } from '@shared/schemas/now-playing';

const remotePrefix = 'remote://';

/** The picture of a track of the host: not a file of this app, the cover comes from the host through the protocol */
const remoteCover = 'remote-cover';

type PlayingSnapshot = Exclude<NowPlaying, { state: 'idle' }>;

/** What tells one track of the host from the next: a new key loads the audio again. The path of the host never reaches this app */
const keyOf = ({ title, artist, album, duration, live }: PlayingSnapshot) =>
  encodeURIComponent(JSON.stringify([title, artist ?? '', album ?? '', duration ?? 0, live ?? false]));

/** The track of the host as this app plays it: its audio comes through the local protocol from the host that the app listens to */
export const toRemoteTrack = (snapshot: PlayingSnapshot): Track => ({
  path: `${remotePrefix}${keyOf(snapshot)}`,
  title: snapshot.title,
  artist: snapshot.artist ?? '',
  album: snapshot.album ?? '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: snapshot.cover ? remoteCover : null,
  duration: snapshot.duration ?? null,
  codec: null,
  bitrate: null,
  lossless: 0,
});

export const isRemoteTrack = (path: string | undefined) => path?.startsWith(remotePrefix) ?? false;

/** The key of a remote track, undefined for any other track */
export const remoteKeyOf = (path: string) => (isRemoteTrack(path) ? path.slice(remotePrefix.length) : undefined);

/** True when the snapshot is the track that is loaded */
export const isSameRemoteTrack = (snapshot: PlayingSnapshot, path: string | undefined) => path === `${remotePrefix}${keyOf(snapshot)}`;

/** The route of the cover of the loaded track of the host, a new one for each track */
const remoteCoverRoute = (path: string) => `/remote/cover?t=${remoteKeyOf(path) ?? ''}`;

/** The route of the cover of a track, from the host while it follows one, undefined without a picture */
export const trackCoverRoute = ({ path, picture }: { path: string; picture: string | null }) => {
  // a track of a server of the user has no file of the library, its server is asked for the picture through the protocol
  if (isSourcePath(path)) return `/source/cover?path=${encodeURIComponent(path)}`;

  return picture ? (isRemoteTrack(path) ? remoteCoverRoute(path) : coverRouteOf(picture)) : undefined;
};
