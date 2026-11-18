import { useEffect, useRef } from 'react';
import { controlCommandSchema, type ControlCommand } from '@shared/schemas/remote-control';

interface RemoteHostInfo {
  title: string;
  artist: string | undefined;
  album: string | undefined;
  /** In seconds, 0 for a station, which has no position to seek to */
  duration: number;
  /** The library path of the file; undefined for a station, which has no file to relay. It never leaves the host */
  path: string | undefined;
  /** The name of the cover file in the album art folder; like the path it stays on the host */
  coverKey: string | undefined;
  /** The track that plays after this one */
  next: { title: string; artist: string | undefined } | undefined;
}

interface RemoteHostPlayback {
  isPlaying: boolean;
  currentTime: number;
  volume: number;
}

interface RemoteHostCommands {
  play: () => void;
  pause: () => void;
  isPlaying: boolean;
  previousSong: () => void;
  nextSong: () => void;
  setCurrentTime: (currentTime: number) => void;
  setVolume: (volume: number) => void;
}

/** Where the position is more than this far from where the playback would be, it was a seek */
const seekThreshold = 1.5;

const run = (command: ControlCommand, { play, pause, isPlaying, previousSong, nextSong, setCurrentTime, setVolume }: RemoteHostCommands) => {
  switch (command.control) {
    case 'playPause':
      return command.action === 'play' || (command.action === 'toggle' && !isPlaying) ? play() : pause();
    case 'skip':
      return command.direction === 'previous' ? previousSong() : nextSong();
    case 'seek':
      return setCurrentTime(command.position);
    case 'volume':
      return setVolume(command.level);
  }
};

/** Sends what plays to the listeners that the host approved, and lets the controls they were given drive the player. See docs/app/remote-access-discovery.md */
export const useRemoteHost = (info: RemoteHostInfo | undefined, { isPlaying, currentTime, volume }: RemoteHostPlayback, commands: RemoteHostCommands) => {
  const latest = useRef({ currentTime, at: Date.now(), isPlaying });
  const current = useRef(commands);
  const listening = useRef(false);
  current.current = commands;

  const send = () => {
    latest.current = { currentTime, at: Date.now(), isPlaying };
    window.electronAPI?.send(
      'REMOTE_STATE',
      info
        ? {
            state: isPlaying ? 'playing' : 'paused',
            title: info.title,
            artist: info.artist,
            album: info.album,
            duration: info.duration > 0 ? info.duration : undefined,
            position: currentTime,
            at: Date.now(),
            path: info.path,
            coverKey: info.coverKey,
            volume,
            next: info.next,
          }
        : { state: 'idle' }
    );
  };

  useEffect(send, [info?.title, info?.artist, info?.album, info?.duration, info?.path, info?.coverKey, info?.next?.title, info?.next?.artist, isPlaying, volume]);

  useEffect(() => {
    if (!info) return;

    const { currentTime: last, at, isPlaying: wasPlaying } = latest.current;
    const expected = last + (wasPlaying ? (Date.now() - at) / 1000 : 0);
    if (Math.abs(currentTime - expected) > seekThreshold) send();
  }, [currentTime]);

  useEffect(() => {
    if (listening.current) return;

    // the page has no way to take a listener off, so there is one for its life and it calls what the player has now
    listening.current = true;
    window.electronAPI?.on<unknown>('REMOTE_CONTROL', (payload) => {
      const command = controlCommandSchema.safeParse(payload).data;
      if (command) run(command, current.current);
    });
  }, []);
};
