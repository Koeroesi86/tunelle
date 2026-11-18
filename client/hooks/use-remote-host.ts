import { useEffect, useRef } from 'react';
import { z } from 'zod';

/** What a listener may ask of the player; the same shape as the main process checks (electron/remote/control-command.ts) */
const remoteControlSchema = z.discriminatedUnion('control', [
  z.object({ control: z.literal('playPause'), action: z.enum(['play', 'pause', 'toggle']) }),
  z.object({ control: z.literal('skip'), direction: z.enum(['next', 'previous']) }),
  z.object({ control: z.literal('seek'), position: z.number().nonnegative() }),
  z.object({ control: z.literal('volume'), level: z.number().min(0).max(1) }),
]);

interface RemoteHostInfo {
  title: string;
  artist: string | undefined;
  album: string | undefined;
  /** In seconds, 0 for a station, which has no position to seek to */
  duration: number;
  /** The library path of the file; undefined for a station, which has no file to relay. It never leaves the host */
  path: string | undefined;
}

interface RemoteHostPlayback {
  isPlaying: boolean;
  currentTime: number;
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

type RemoteControl = z.infer<typeof remoteControlSchema>;

const run = (command: RemoteControl, { play, pause, isPlaying, previousSong, nextSong, setCurrentTime, setVolume }: RemoteHostCommands) => {
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
export const useRemoteHost = (info: RemoteHostInfo | undefined, { isPlaying, currentTime }: RemoteHostPlayback, commands: RemoteHostCommands) => {
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
          }
        : { state: 'idle' }
    );
  };

  useEffect(send, [info?.title, info?.artist, info?.album, info?.duration, info?.path, isPlaying]);

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
      const command = remoteControlSchema.safeParse(payload).data;
      if (command) run(command, current.current);
    });
  }, []);
};
