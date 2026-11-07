// Chromium lets the audio context pick its output device; the DOM types of TypeScript do not have it yet
interface AudioContext {
  readonly sinkId: string | { type: string };
  setSinkId(sinkId: string): Promise<void>;
}

interface AudioContextOptions {
  /** The output device the context is made for; its rate is the rate of that device */
  sinkId?: string;
}
