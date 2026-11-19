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
    /** Makes the probe listen or not: a processor that is pulled wakes the page about fifty times a second, which a measurement of the idle processor must not include */
    listenWithProbe?: (listening: boolean) => void;
  }
}

export const installAudioProbe = () => {
  const probe: Probe = { sampleRate: 0, windows: [] };
  window.audioProbe = probe;
  let listening = true;
  const connected = new Set<{ node: ScriptProcessorNode; context: BaseAudioContext }>();
  window.listenWithProbe = (on) => {
    listening = on;
    // the processor is only pulled when it leads to the destination
    connected.forEach(({ node, context }) => Reflect.apply(on ? originalConnect : originalDisconnect, node, [context.destination]));
  };

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
    if (!(context instanceof AudioContext)) return bus;

    const windowLength = 1024;
    // a script processor needs no module, which the policy of the page (script-src 'self') would refuse a worklet to load from a blob
    const node = context.createScriptProcessor(windowLength, 2, 1);
    node.onaudioprocess = ({ inputBuffer, playbackTime }) => {
      const channel = inputBuffer.getChannelData(0);
      const samples = Array.from(channel);
      probe.windows.push({
        frame: Math.round(playbackTime * context.sampleRate),
        frames: samples.length,
        rms: Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length),
        peak: samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
        crossings: samples.filter((sample, index) => sample >= 0 && (samples[index - 1] ?? 0) < 0).length,
      });
    };
    Reflect.apply(originalConnect, bus, [node]);
    connected.add({ node, context });
    if (listening) Reflect.apply(originalConnect, node, [context.destination]);
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
