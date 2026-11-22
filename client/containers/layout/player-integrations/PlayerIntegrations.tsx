import type { Track } from '@shared/types/library';
import { toNowPlaying } from '../../../domain/now-playing';
import { radioUuidOf } from '../../../domain/radio-track';
import { isRemoteTrack } from '../../../domain/remote-track';
import { isSourcePath } from '../../../domain/source-track';
import { optimizedCoverOf } from '../../../utils/cover-url';
import { localUrl } from '../../../services/local-url';
import { useMediaSession, useMediaSessionActions } from './use-media-session';
import { useMpris, useMprisCommands } from './use-mpris';
import { useRemoteHost } from './use-remote-host';

export interface PlayerIntegrationsProps {
  currentSong: Track | null;
  upNext: Track | null;
  streamTitle: string | null;
  streamArt: string | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  play: () => void;
  pause: () => void;
  setCurrentTime: (currentTime: number) => void;
  setVolume: (volume: number | string) => void;
  previousSong: () => void;
  nextSong: () => void;
}

/** What the player tells the media controls of the system and the hosts that listen, and takes from them; it shows nothing */
const PlayerIntegrations = ({
  currentSong,
  upNext,
  streamTitle,
  streamArt,
  isPlaying,
  currentTime,
  volume,
  play,
  pause,
  setCurrentTime,
  setVolume,
  previousSong,
  nextSong,
}: PlayerIntegrationsProps) => {
  const shown = currentSong ? toNowPlaying(currentSong, streamTitle, streamArt) : undefined;
  const cover = shown?.cover && localUrl(shown.cover);
  const duration = shown && !radioUuidOf(shown.track.path) ? (shown.track.duration ?? 0) : 0;
  // a station, a track of another host and a track of a server of the user are not files of this library, so a listener is not given a path to ask for
  const hostedFile = shown !== undefined && !radioUuidOf(shown.track.path) && !isRemoteTrack(shown.track.path) && !isSourcePath(shown.track.path);

  useMediaSession(shown && { title: shown.track.title, artist: shown.track.artist, album: shown.track.album, cover });
  useMediaSessionActions({ play, pause, previousSong, nextSong });
  useMprisCommands({ play, pause, isPlaying, previousSong, nextSong, setCurrentTime });
  useMpris(shown && { title: shown.track.title, artist: shown.track.artist, album: shown.track.album, cover, duration }, {
    isPlaying,
    currentTime,
  });
  useRemoteHost(
    shown && {
      title: shown.track.title,
      artist: shown.track.artist,
      album: shown.track.album,
      duration,
      path: hostedFile ? shown.track.path : undefined,
      station: radioUuidOf(shown.track.path),
      coverKey: hostedFile && shown.track.picture ? optimizedCoverOf(shown.track.picture) : undefined,
      next: upNext ? { title: upNext.title, artist: upNext.artist || undefined } : undefined,
    },
    { isPlaying, currentTime, volume },
    { play, pause, isPlaying, previousSong, nextSong, setCurrentTime, setVolume }
  );

  return null;
};

export default PlayerIntegrations;
