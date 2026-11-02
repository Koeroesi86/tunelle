import { useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import type { Track } from '../../types/library';
import { createLeadMeter, msUntilHandoff } from '../audio/gapless';
import { isFileTrack, sourceOf } from '../audio/track-source';
import { useLatest } from './use-latest';

/** HAVE_FUTURE_DATA: the element can play on without waiting */
const canPlayOn = 3;

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

interface GaplessAudioOptions {
  currentSong: Track | null;
  upNext: Track | null;
  activateNode: (node: HTMLAudioElement) => void;
  /** The element that plays reached its end and no other element is starting: the track that follows is loaded the usual way */
  onEnded: () => void;
  /** The other element plays: the track that follows is the current one now */
  onHandoff: () => void;
}

/**
 * Two audio elements take turns: while one plays, the other loads the track that follows and starts a little before the end of the playing one,
 * so the next track sounds as the current one is done. Both feed the same input of the audio context, so the equalizer is not rebuilt in between.
 */
export const useGaplessAudio = ({ currentSong, upNext, activateNode, onEnded, onHandoff }: GaplessAudioOptions) => {
  const elements = useRef<(HTMLAudioElement | null)[]>([null, null]);
  const active = useRef(0);
  // the source each element holds, so a track that is loaded already is not loaded again
  const loaded = useRef<(string | undefined)[]>([undefined, undefined]);
  // the source the standby element took over with, as the current song of the state follows a moment later
  const swappedTo = useRef<string | undefined>(undefined);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // set from the call to play of the standby element until it plays
  const handoffStartedAt = useRef<number | undefined>(undefined);
  const leadMeter = useRef(createLeadMeter());
  const latest = useLatest({ currentSong, upNext, onEnded, onHandoff });
  const activeElement = () => elements.current[active.current];
  const standbyIndex = () => 1 - active.current;
  const standbyElement = () => elements.current[standbyIndex()];
  const isActive = (index: number) => index === active.current;

  const cancelHandoff = () => {
    clearTimeout(handoffTimer.current);
    handoffTimer.current = undefined;
    if (handoffStartedAt.current === undefined) return;

    handoffStartedAt.current = undefined;
    standbyElement()?.pause();
  };

  // the standby element is loaded with the track that follows; a station has no end and no next track, so it loads nothing
  const preloadNext = () => {
    const index = standbyIndex();
    const node = elements.current[index];
    const { currentSong: song, upNext: following } = latest.current;
    // an element that still plays the end of the last track is loaded when it ends
    if (!node || handoffStartedAt.current !== undefined || !node.paused) return;

    const wanted = isFileTrack(song) && isFileTrack(following) ? sourceOf(following) : undefined;
    if (loaded.current[index] === wanted) return;

    loaded.current[index] = wanted;
    if (wanted) node.src = wanted;
    else node.removeAttribute('src');
    node.load();
  };

  const handleEnded = (index: number) => {
    // the end of the track that the other element took over from
    if (!isActive(index)) {
      loaded.current[index] = undefined;
      return preloadNext();
    }

    // the standby element is starting, it steps to the next track when it plays
    if (handoffStartedAt.current === undefined) latest.current.onEnded();
  };

  const failHandoff = () => {
    handoffStartedAt.current = undefined;
    // the playing track ended while the standby element started: nothing else steps on, so the usual end follows
    if (activeElement()?.ended) handleEnded(active.current);
  };

  const startHandoff = () => {
    handoffTimer.current = undefined;
    const index = standbyIndex();
    const node = standbyElement();
    // a track that is not loaded in time follows the usual way, once the current one ends
    if (!node || !loaded.current[index] || node.readyState < canPlayOn) return;

    handoffStartedAt.current = performance.now();
    node.play().catch((err) => {
      if (isAbort(err)) return;

      console.error(err);
      loaded.current[index] = undefined;
      failHandoff();
    });
  };

  // the next track starts as much before the end as the start of an element took the last times
  const scheduleHandoff = () => {
    clearTimeout(handoffTimer.current);
    handoffTimer.current = undefined;
    const node = activeElement();
    if (!node || node.paused || handoffStartedAt.current !== undefined || !loaded.current[standbyIndex()]) return;

    const wait = msUntilHandoff(node.duration, node.currentTime, leadMeter.current.lead());
    if (wait !== undefined) handoffTimer.current = setTimeout(startHandoff, wait);
  };

  // the standby element plays: the track that follows is the current one, the other element only finishes its last moments
  const completeHandoff = (index: number) => {
    const startedAt = handoffStartedAt.current;
    const node = elements.current[index];
    if (startedAt === undefined || !node) return;

    handoffStartedAt.current = undefined;
    leadMeter.current.record((performance.now() - startedAt) / 1000);
    active.current = index;
    activateNode(node);
    swappedTo.current = loaded.current[index];
    latest.current.onHandoff();
  };

  // a track that was asked for while the standby element holds it (Next) continues there
  const takeOver = (index: number, node: HTMLAudioElement, shouldPlay: boolean) => {
    const previous = activeElement();
    loaded.current[active.current] = undefined;
    active.current = index;
    activateNode(node);
    previous?.pause();
    node.currentTime = 0;
    if (shouldPlay) node.play().catch((err) => console.error(err));
  };

  useEffect(() => cancelHandoff, []);

  return {
    /** The ref of the element at this index */
    register: (index: number) => (node: HTMLAudioElement | null) => {
      elements.current[index] = node;
    },
    elements,
    /** To run after the effect that starts a new current song, as that one takes over a track that the standby element holds already */
    preloadNext,
    isActive,
    activeElement,
    /** The source an element holds, undefined for one that holds none */
    loadedSource: (index: number) => loaded.current[index],
    cancelHandoff,
    setVolume: (volume: number) =>
      elements.current.forEach((node) => {
        if (node && node.volume !== volume) node.volume = volume;
      }),
    handleEnded,
    /** Whether the error is the one of the element that plays; a failed element that waits is dropped, and the usual way follows */
    handleError: (index: number) => {
      if (isActive(index)) return true;

      loaded.current[index] = undefined;
      if (handoffStartedAt.current !== undefined) failHandoff();
      return false;
    },
    /** Whether the element that plays plays, the other one that plays is the start of a hand-off */
    handlePlaying: (index: number) => {
      if (!isActive(index)) {
        completeHandoff(index);
        return false;
      }

      scheduleHandoff();
      return true;
    },
    handleTimeUpdate: (index: number) => isActive(index) && scheduleHandoff(),
    // the end of a track pauses it as well, and that is no reason to stop the next track from starting
    handlePause: (index: number, event: SyntheticEvent<HTMLAudioElement>) => isActive(index) && !event.currentTarget.ended && cancelHandoff(),
    /** Whether the track continues in an element that holds it already (handed over or taken over); false when it has to be loaded */
    changeTrack: (source: string, shouldPlay: boolean) => {
      cancelHandoff();
      const handedOver = source !== '' && swappedTo.current === source;
      swappedTo.current = undefined;
      const standby = standbyElement();
      if (handedOver) return true;
      if (!source || !standby || loaded.current[standbyIndex()] !== source) return false;

      takeOver(standbyIndex(), standby, shouldPlay);
      return true;
    },
    /** Empties the element that plays, which closes the connection of a stream that a pause leaves open and buffering */
    release: () => {
      const node = activeElement();
      if (!node) return;

      loaded.current[active.current] = undefined;
      node.removeAttribute('src');
      node.load();
    },
    /** Whether the element that plays holds a source */
    holdsSource: () => activeElement()?.hasAttribute('src') ?? false,
    /** Loads a source into the element that plays */
    load: (source: string) => {
      const node = activeElement();
      if (!node) return undefined;

      loaded.current[active.current] = source || undefined;
      node.src = source;
      return node;
    },
  };
};
