// A tap on the audio that leaves the app, installed in the page before its own code runs (page.addInitScript).
// The window is started with --disable-audio-output, so nothing is heard, and the graph runs as it does with a device: what reaches the destination of the context is measured.
// The numbers are stamped with the audio clock (frames of the context), so a busy runner moves a measurement of time no more than it moves the sound.

export interface ProbeWindow {
  /** The first frame of the window on the clock of the context */
  frame: number;
  frames: number;
  rms: number;
  peak: number;
  /** Rising zero crossings: the cycles of a tone */
  crossings: number;
}

export interface Probe {
  sampleRate: number;
  windows: ProbeWindow[];
}

declare global {
  interface Window {
    audioProbe?: Probe;
    /** Makes the probe listen or not: a worklet that is pulled wakes the page about fifty times a second, which a measurement of the idle processor must not include */
    listenWithProbe?: (listening: boolean) => void;
  }
}

export const installAudioProbe = () => {
  const probe: Probe = { sampleRate: 0, windows: [] };
  window.audioProbe = probe;
  let listening = true;
  const connected = new Set<{ node: AudioWorkletNode; context: AudioContext }>();
  window.listenWithProbe = (on) => {
    listening = on;
    // the worklet is only pulled when it leads to the destination
    connected.forEach(({ node, context }) => Reflect.apply(on ? originalConnect : originalDisconnect, node, [context.destination]));
  };

  const processorSource = `
    registerProcessor('probe', class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.length = 1024;
        this.reset(currentFrame);
        this.last = 0;
      }
      reset(frame) {
        this.frame = frame;
        this.frames = 0;
        this.sumOfSquares = 0;
        this.peak = 0;
        this.crossings = 0;
      }
      process(inputs) {
        const channel = inputs[0][0];
        for (let index = 0; index < 128; index += 1) {
          const sample = channel ? channel[index] : 0;
          this.sumOfSquares += sample * sample;
          this.peak = Math.max(this.peak, Math.abs(sample));
          if (this.last < 0 && sample >= 0) this.crossings += 1;
          this.last = sample;
        }
        this.frames += 128;
        if (this.frames >= this.length) {
          this.port.postMessage({ frame: this.frame, frames: this.frames, rms: Math.sqrt(this.sumOfSquares / this.frames), peak: this.peak, crossings: this.crossings });
          this.reset(currentFrame + 128);
        }
        return true;
      }
    });
  `;

  const originalConnect = AudioNode.prototype.connect;
  const originalDisconnect = AudioNode.prototype.disconnect;
  const buses = new WeakMap<BaseAudioContext, GainNode>();

  // everything that is connected to the destination is connected to the bus too, which the worklet listens to
  const busOf = (context: BaseAudioContext) => {
    const existing = buses.get(context);
    if (existing) return existing;

    const bus = context.createGain();
    buses.set(context, bus);
    probe.sampleRate = context.sampleRate;
    const module = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }));
    if (context instanceof AudioContext) {
      context.audioWorklet.addModule(module).then(() => {
        const node = new AudioWorkletNode(context, 'probe', { numberOfOutputs: 1, outputChannelCount: [1] });
        node.port.onmessage = ({ data }) => probe.windows.push(data);
        // the worklet is only pulled when it leads to the destination; it makes no sound itself
        Reflect.apply(originalConnect, bus, [node]);
        connected.add({ node, context });
        if (listening) Reflect.apply(originalConnect, node, [context.destination]);
      });
    }
    return bus;
  };

  AudioNode.prototype.connect = function connect(this: AudioNode, destination: AudioNode | AudioParam, ...rest: number[]) {
    if (destination instanceof AudioDestinationNode) Reflect.apply(originalConnect, this, [busOf(destination.context)]);
    return Reflect.apply(originalConnect, this, [destination, ...rest]);
  };

  AudioNode.prototype.disconnect = function disconnect(this: AudioNode, ...args: unknown[]) {
    const [destination] = args;
    if (destination instanceof AudioDestinationNode) Reflect.apply(originalDisconnect, this, [busOf(destination.context)]);
    return Reflect.apply(originalDisconnect, this, args);
  };
};
