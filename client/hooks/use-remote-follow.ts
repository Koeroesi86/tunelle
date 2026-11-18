import { useEffect, useRef } from 'react';
import type { Track } from '@shared/types/library';
import type { NowPlaying } from '@shared/schemas/now-playing';
import { driftCorrection } from '@shared/utils/remote-position';
import { isRemoteTrack, isSameRemoteTrack, toRemoteTrack } from '../domain/remote-track';

/** How often the position of the listener is compared with where the host is */
const FOLLOW_MS = 1000;

interface RemoteFollowPlayer {
  currentSong: Track | null;
  isPlaying: boolean;
  currentTime: number;
  play: () => void;
  pause: () => void;
  setCurrentTime: (currentTime: number) => void;
  load: (track: Track) => void;
  /** Ends the session with the host: the main process closes its stream and forgets the pairing */
  leave: () => void;
}

/** Plays what the host plays while the loaded track is the remote one, and leaves the session as soon as any other track is loaded. See docs/app/remote-access-discovery.md */
export const useRemoteFollow = (snapshot: NowPlaying | undefined, player: RemoteFollowPlayer) => {
  const latest = useRef(player);
  latest.current = player;

  const wasRemote = useRef(false);
  const path = player.currentSong?.path;

  useEffect(() => {
    const remote = isRemoteTrack(path);
    if (wasRemote.current && !remote && path !== undefined) latest.current.leave();
    wasRemote.current = remote;
  }, [path]);

  useEffect(() => {
    const { currentSong, isPlaying, currentTime, play, pause, setCurrentTime, load } = latest.current;
    if (!isRemoteTrack(currentSong?.path)) return;
    // no snapshot: the host revoked or blocked this device, or the session ended; the element still holds what it buffered, so it is stopped
    if (!snapshot) return isPlaying ? pause() : undefined;

    if (snapshot.state === 'idle') return isPlaying ? pause() : undefined;
    if (!isSameRemoteTrack(snapshot, currentSong?.path)) return load(toRemoteTrack(snapshot));

    if (snapshot.state === 'playing' && !isPlaying) play();
    if (snapshot.state === 'paused' && isPlaying) pause();

    // a station has no position: it plays as it comes
    const correction = snapshot.live ? undefined : driftCorrection(snapshot, currentTime);
    if (correction !== undefined) setCurrentTime(correction);
  }, [snapshot]);

  // the host only sends a snapshot when something changes: a track that was loaded after the last one, or a listener that is paused while the host plays, would stay where it is
  useEffect(() => {
    const correct = () => {
      const { currentSong, currentTime, setCurrentTime } = latest.current;
      if (!snapshot || snapshot.state === 'idle' || !isSameRemoteTrack(snapshot, currentSong?.path)) return;
      const correction = driftCorrection(snapshot, currentTime);
      if (correction !== undefined) setCurrentTime(correction);
    };
    correct();
    const timer = setInterval(correct, FOLLOW_MS);
    return () => clearInterval(timer);
  }, [snapshot, path]);
};
