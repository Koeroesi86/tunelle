import type { Track } from '@shared/types/library';
import { localUrl } from '../services/local-url';
import { getCoverUrl } from '../utils/cover-url';
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

/** The address of the cover of the loaded track of the host, a new one for each track */
const remoteCoverUrl = (path: string) => localUrl(`/remote/cover?t=${remoteKeyOf(path) ?? ''}`);

/** The address of the cover of a track, from the host while it follows one, undefined without a picture */
export const trackCoverUrl = ({ path, picture }: { path: string; picture: string | null }) =>
  picture ? (isRemoteTrack(path) ? remoteCoverUrl(path) : getCoverUrl(picture)) : undefined;
