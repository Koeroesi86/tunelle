import { useSyncExternalStore } from 'react';

interface OutputRateSource {
  getSampleRate: () => number;
  addOutputChangeListener: (listener: () => void) => void;
  removeOutputChangeListener: (listener: () => void) => void;
}

/** The rate the audio context outputs at, which changes when the sound moves to a device at another rate */
export const useOutputSampleRate = ({ getSampleRate, addOutputChangeListener, removeOutputChangeListener }: OutputRateSource) =>
  useSyncExternalStore((onChange) => {
    addOutputChangeListener(onChange);
    return () => removeOutputChangeListener(onChange);
  }, getSampleRate);
