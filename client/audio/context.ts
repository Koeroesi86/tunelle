import { createContext } from 'react';
import { needsSeek } from './equalizer';

type PlayStatusListener = (isPlaying: boolean) => void;
type TimeChangeListener = (currentTime: number) => void;

/** Where the track was when the context was replaced: the new elements continue from there. See docs/app/audio-context.md */
export interface ContextResume {
  position: number;
  wasPlaying: boolean;
}

const createListeners = <T>() => {
  const listeners = new Set<(value: T) => void>();

  return {
    add: (listener: (value: T) => void) => listeners.add(listener),
    remove: (listener: (value: T) => void) => listeners.delete(listener),
    notify: (value: T) => listeners.forEach((listener) => listener(value)),
  };
};

let audioContext = new window.AudioContext();
let switching: Promise<void> = Promise.resolve();
let audioNode: HTMLAudioElement | null = null;
// the sound of every element comes in here, so the equalizer and the analyser do not care which element plays; an element can only be wrapped once,
// a second createMediaElementSource on it throws
let input = audioContext.createGain();
const wrappedElements = new Set<HTMLAudioElement>();
// the loudness normalization of each element, as an element plays one track after the other
const normalizers = new Map<HTMLAudioElement, GainNode>();
const normalizationRamp = 0.05;
let analyser: AnalyserNode | undefined;
let mounted = false;
const playStatus = createListeners<boolean>();
const timeChange = createListeners<number>();
const audioMountListeners = new Set<() => void>();
const outputChange = createListeners<ContextResume>();
let timeChangeTimer: ReturnType<typeof setInterval> | undefined;
const currentTimeFPS = 5;
let currentTime = 0;

const onAudioMounted = (listener: () => void) => {
  audioMountListeners.add(listener);
  if (mounted) listener();
};

const seek = (to: number) => {
  currentTime = to;
  if (audioNode && audioNode.duration && needsSeek(audioNode.currentTime, to)) {
    audioNode.currentTime = to;
  }
};

// the element that waits for the next track or finishes the last one does not speak for the player
const listenToPlayStatus = (node: HTMLAudioElement) => {
  const isActive = () => node === audioNode;
  // a track that reaches its end is paused before it ends: that is not a pause of the listener, the next track follows
  node.addEventListener('pause', () => isActive() && !node.ended && playStatus.notify(false));
  node.addEventListener('play', () => isActive() && playStatus.notify(true));
  node.addEventListener('error', () => {
    if (!isActive()) return;

    console.warn('error playing', node.src);
    playStatus.notify(false);
  });
};

const startTimeChanges = () => {
  clearInterval(timeChangeTimer);
  timeChangeTimer = setInterval(() => {
    if (!audioNode) return;

    currentTime = audioNode.currentTime;
    timeChange.notify(currentTime);
  }, 1000 / currentTimeFPS);
};

const wrapNode = (node: HTMLAudioElement) => {
  if (wrappedElements.has(node)) return;

  wrappedElements.add(node);
  listenToPlayStatus(node);
  const normalizer = audioContext.createGain();
  normalizers.set(node, normalizer);
  audioContext.createMediaElementSource(node).connect(normalizer);
  normalizer.connect(input);

  if (mounted) return;

  mounted = true;
  audioMountListeners.forEach((listener) => listener());
  seek(currentTime);
  startTimeChanges();
};

const connectNode = (node: HTMLAudioElement | null) => {
  audioNode = node;
  if (node) wrapNode(node);
};

/** An element that takes over from the playing one: its sound joins the same input, the status of the player stays with the playing element */
const connectStandbyNode = (node: HTMLAudioElement | null) => node && wrapNode(node);

/** From now on this element is the one that plays: its time, its status and the play and pause commands are the player's */
const activateNode = (node: HTMLAudioElement) => {
  wrapNode(node);
  audioNode = node;
};

/** Sets the factor an element is multiplied by; one that is not playing takes it at once, one that plays glides to it so a change of the mode does not click */
const setNormalization = (node: HTMLAudioElement, factor: number) => {
  const { gain } = normalizers.get(node) ?? {};
  if (!gain) return;

  gain.cancelScheduledValues(audioContext.currentTime);
  if (node.paused) gain.setValueAtTime(factor, audioContext.currentTime);
  else gain.setTargetAtTime(factor, audioContext.currentTime, normalizationRamp);
};

/** Replaces the context by one that runs at the rate of its device: the elements, the gains and the analyser belong to a context and are made again */
const replaceContext = (next: AudioContext) => {
  const previous = audioContext;
  const resume = { position: audioNode?.currentTime ?? currentTime, wasPlaying: audioNode ? !audioNode.paused : false };
  // no longer the element of the player, so the pause of the old elements is no pause of the listener
  audioNode = null;
  wrappedElements.forEach((node) => node.pause());
  clearInterval(timeChangeTimer);
  audioContext = next;
  watchDefaultDevice(next);
  input = next.createGain();
  wrappedElements.clear();
  normalizers.clear();
  analyser = undefined;
  mounted = false;
  currentTime = resume.position;
  next.resume().catch((err) => console.warn('audio context not resumed', err));
  outputChange.notify(resume);
  previous.close().catch((err) => console.warn('audio context not closed', err));
};

/** A context on the device with this id, or on the default when the device cannot be opened (unplugged) */
const openContext = (id: string) =>
  Promise.resolve()
    .then(() => new window.AudioContext({ sinkId: id }))
    .catch((err) => {
      console.warn('output device unavailable', id, err);
      return new window.AudioContext();
    });

/**
 * Plays on the output device with this id, '' is the system default. A device that runs at the rate of the context takes the sound as it is,
 * one at another rate gets a context of its own, as the context is fixed to a rate and the browser would resample between the two.
 */
const switchOutputDevice = async (id: string) => {
  if (audioContext.sinkId === id) return;

  const next = await openContext(id);
  if (next.sampleRate === audioContext.sampleRate) {
    await next.close();
    await audioContext.setSinkId(id).catch((err) => {
      console.warn('output device unavailable', id, err);
      return audioContext.setSinkId('');
    });
    return;
  }

  replaceContext(next);
};

// the devices are looked for again as they come and go, so a switch waits for the one before it, and finds the device it asked for there already
const queueSwitch = (run: () => Promise<void>) => {
  const result = switching.then(run);
  switching = result.catch(() => undefined);
  return result;
};

const setOutputDevice = (id: string) => queueSwitch(() => switchOutputDevice(id));

/** The system default changed under a context that plays on it: the context keeps its rate, so it is replaced when the new default runs at another one */
const followDefaultDevice = async () => {
  if (audioContext.sinkId !== '') return;

  const next = await openContext('');
  if (next.sampleRate === audioContext.sampleRate) return void (await next.close());

  replaceContext(next);
};

const watchDefaultDevice = (context: AudioContext) =>
  context.addEventListener('sinkchange', () => {
    if (context === audioContext) queueSwitch(followDefaultDevice).catch((err) => console.warn('default device not followed', err));
  });
watchDefaultDevice(audioContext);

/** The rate the context mixes and plays at, which is the rate of the device it was made for */
const getSampleRate = () => audioContext.sampleRate;

const connectToSource = (item: AudioNode) => {
  input.connect(item);
};

const play = () => {
  // a track change asks for play more than once; a started element is not asked again, as a request that a new source interrupts is rejected
  if (!audioNode?.paused) return;

  audioNode
    .play()
    .then(() => console.log('playing', audioNode?.src))
    .catch((err) => {
      // a play that a new source or a pause interrupted is not a failure
      if (!(err instanceof DOMException && err.name === 'AbortError')) console.error(err);
    });
};

// the element that takes over is paused too, as it may be starting
const pause = () => wrappedElements.forEach((node) => node.pause());

const createAnalyser = (): AnalyserNode | undefined => {
  if (!mounted) return undefined;

  // only listens: its output is not connected, as it would play the signal a second time, around the equalizer
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 2048;
    input.connect(analyser);
  }

  return analyser;
};

const createBiquadFilter = () => audioContext.createBiquadFilter();
const createGain = () => audioContext.createGain();
const connectDestination = (node: AudioNode) => node.connect(audioContext.destination);

export const Audio = createContext({
  addPlayStatusListener: (listener: PlayStatusListener) => void playStatus.add(listener),
  removePlayStatusListener: (listener: PlayStatusListener) => void playStatus.remove(listener),
  addTimeChangeListener: (listener: TimeChangeListener) => void timeChange.add(listener),
  connectNode,
  connectStandbyNode,
  activateNode,
  setNormalization,
  setOutputDevice,
  getSampleRate,
  addOutputChangeListener: (listener: (resume: ContextResume) => void) => void outputChange.add(listener),
  removeOutputChangeListener: (listener: (resume: ContextResume) => void) => void outputChange.remove(listener),
  connectToSource,
  connectDestination,
  createBiquadFilter,
  createGain,
  onAudioMounted,
  play,
  pause,
  seek,
  createAnalyser,
});
