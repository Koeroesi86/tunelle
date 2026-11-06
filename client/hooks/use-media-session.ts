import { useEffect } from 'react';

interface MediaSessionInfo {
  title: string;
  artist: string;
  album: string;
  cover: string | undefined;
}

/** Tells the OS media controls what plays */
export const useMediaSession = (info: MediaSessionInfo | undefined) => {
  useEffect(() => {
    if (window.electronAPI?.mpris || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    if (!info) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album });
    navigator.mediaSession.metadata = metadata;
    if (!info.cover) return;

    // an artwork can only be an http, https, data or blob address, so the cover of the tunelle protocol goes in as a blob
    const controller = new AbortController();
    let objectUrl: string | undefined;

    fetch(info.cover, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`The cover answered ${response.status}`);

        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;

        objectUrl = URL.createObjectURL(blob);
        metadata.artwork = [{ src: objectUrl }];
      })
      .catch(() => undefined); // the controls show the track without a cover

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [info?.title, info?.artist, info?.album, info?.cover]);
};

interface MediaSessionActions {
  play: () => void;
  pause: () => void;
  previousSong: () => void;
  nextSong: () => void;
}

/** Lets the media keys and the OS media controls drive the player, as without a handler they have nothing to call */
export const useMediaSessionActions = ({ play, pause, previousSong, nextSong }: MediaSessionActions) => {
  useEffect(() => {
    if (window.electronAPI?.mpris || !('mediaSession' in navigator)) return;

    const handlers: [MediaSessionAction, () => void][] = [
      ['play', play],
      ['pause', pause],
      ['previoustrack', previousSong],
      ['nexttrack', nextSong],
    ];
    handlers.forEach(([action, handler]) => navigator.mediaSession.setActionHandler(action, handler));

    return () => handlers.forEach(([action]) => navigator.mediaSession.setActionHandler(action, null));
  }, [play, pause, previousSong, nextSong]);
};
