import { useEffect, useRef } from 'react';
import type { Track } from '@shared/types/library';
import type { NowPlaying } from '@shared/schemas/now-playing';
import { driftCorrection } from '@shared/utils/remote-position';
import { isRemoteTrack, isSameRemoteTrack, toRemoteTrack } from '../domain/remote-track';

interface RemoteFollowPlayer {
  currentSong: Track | null;
  isPlaying: boolean;
  currentTime: number;
  play: () => void;
  pause: () => void;
  setCurrentTime: (currentTime: number) => void;
  load: (track: Track) => void;
}

/** Plays what the host plays while the loaded track is the remote one, and leaves as soon as any other track is. See docs/app/remote-access-discovery.md */
export const useRemoteFollow = (snapshot: NowPlaying | undefined, player: RemoteFollowPlayer) => {
  const latest = useRef(player);
  latest.current = player;

  useEffect(() => {
    const { currentSong, isPlaying, currentTime, play, pause, setCurrentTime, load } = latest.current;
    if (!snapshot || !isRemoteTrack(currentSong?.path)) return;

    if (snapshot.state === 'idle') return isPlaying ? pause() : undefined;
    if (!isSameRemoteTrack(snapshot, currentSong?.path)) return load(toRemoteTrack(snapshot));

    if (snapshot.state === 'playing' && !isPlaying) play();
    if (snapshot.state === 'paused' && isPlaying) pause();

    const correction = driftCorrection(snapshot, currentTime);
    if (correction !== undefined) setCurrentTime(correction);
  }, [snapshot]);
};
