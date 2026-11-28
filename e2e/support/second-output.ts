declare global {
  interface Window {
    /** Takes the second output device away, as when it is unplugged */
    unplugSecondOutput?: () => void;
    /** Brings it back */
    plugSecondOutput?: () => void;
    /** The audio contexts of the page that are not closed */
    openAudioContexts?: () => number;
  }
}

/** A second output device that runs at 96 kHz, added to the page before its own code runs: a context on it is a real one at that rate, which plays to the sink of the test */
export const installSecondOutput = () => {
  const id = 'e2e-second';
  const device: MediaDeviceInfo = { deviceId: id, kind: 'audiooutput', label: 'Second output', groupId: id, toJSON: () => ({}) };
  let plugged = true;
  const list = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async () => [...(await list()), ...(plugged ? [device] : [])];

  let contexts: AudioContext[] = [];
  window.openAudioContexts = () => {
    contexts = contexts.filter((context) => context.state !== 'closed');
    return contexts.length;
  };

  window.AudioContext = class extends window.AudioContext {
    constructor(options: AudioContextOptions & { sinkId?: string } = {}) {
      const second = options.sinkId === id;
      if (second && !plugged) throw new DOMException('The device is not there', 'NotFoundError');

      super(second ? { sampleRate: 96000 } : options);
      if (second) Object.defineProperty(this, 'sinkId', { get: () => id });
      contexts.push(this);
    }
  };

  const setPlugged = (to: boolean) => {
    plugged = to;
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  };
  window.unplugSecondOutput = () => setPlugged(false);
  window.plugSecondOutput = () => setPlugged(true);
};
