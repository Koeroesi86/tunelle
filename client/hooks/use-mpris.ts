import { useEffect, useRef } from 'react';

interface MprisInfo {
  title: string;
  artist: string;
  album: string;
  cover: string | undefined;
  /** In seconds, 0 for a station, which has no position to seek to */
  duration: number;
}

interface MprisPlayback {
  isPlaying: boolean;
  currentTime: number;
}

/** Where the position is more than this far from where the playback would be, it was a seek */
const seekThreshold = 1.5;

// the media controls of the desktop on Linux are the MPRIS service of the main process (electron/services/mpris.ts), not navigator.mediaSession
const mprisEnabled = () => window.electronAPI?.mpris === true;

/** Sends what plays to the media controls of the desktop: the track, the cover, whether it plays and where it is */
export const useMpris = (info: MprisInfo | undefined, { isPlaying, currentTime }: MprisPlayback) => {
  const latest = useRef({ currentTime, at: Date.now(), isPlaying });

  const send = (seeked: boolean) => {
    latest.current = { currentTime, at: Date.now(), isPlaying };
    window.electronAPI.send('MPRIS_STATE', {
      track: info && { title: info.title, artist: info.artist, album: info.album, duration: info.duration, coverUrl: undefined },
      playing: isPlaying,
      position: currentTime,
      seeked,
    });
  };

  useEffect(() => {
    if (mprisEnabled()) send(false);
  }, [info?.title, info?.artist, info?.album, info?.duration, isPlaying]);

  useEffect(() => {
    if (!mprisEnabled() || !info) return;

    const { currentTime: last, at, isPlaying: wasPlaying } = latest.current;
    const expected = last + (wasPlaying ? (Date.now() - at) / 1000 : 0);
    if (Math.abs(currentTime - expected) > seekThreshold) send(true);
  }, [currentTime]);

  useEffect(() => {
    if (!mprisEnabled()) return;

    window.electronAPI.send('MPRIS_COVER', undefined);
    if (!info?.cover) return;

    const controller = new AbortController();
    fetch(info.cover, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`The cover answered ${response.status}`);

        return response.blob();
      })
      .then(async (blob) => {
        if (!controller.signal.aborted) window.electronAPI.send('MPRIS_COVER', { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type });
      })
      .catch(() => undefined); // the controls show the track without a cover

    return () => controller.abort();
  }, [info?.cover]);
};

interface MprisCommands {
  play: () => void;
  pause: () => void;
  isPlaying: boolean;
  previousSong: () => void;
  nextSong: () => void;
  setCurrentTime: (currentTime: number) => void;
}

type MprisCommand = { name: 'play' | 'pause' | 'playPause' | 'stop' | 'next' | 'previous' } | { name: 'seekTo'; position: number };

/** Lets the buttons of the media controls and the media keys drive the player */
export const useMprisCommands = (commands: MprisCommands) => {
  const current = useRef(commands);
  const listening = useRef(false);
  current.current = commands;

  useEffect(() => {
    if (!mprisEnabled() || listening.current) return;

    // the page has no way to take a listener off, so there is one for its life and it calls what the player has now
    listening.current = true;
    window.electronAPI.on<MprisCommand>('MPRIS_COMMAND', (command) => {
      const { play, pause, isPlaying, previousSong, nextSong, setCurrentTime } = current.current;
      const actions = {
        play,
        pause,
        stop: pause,
        playPause: isPlaying ? pause : play,
        next: nextSong,
        previous: previousSong,
        seekTo: () => command.name === 'seekTo' && setCurrentTime(command.position),
      };

      actions[command.name]();
    });
  }, []);
};
