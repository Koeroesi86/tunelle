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
  /** The rms of the right channel; the other numbers are of the left one */
  rightRms: number;
  rightCrossings: number;
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
    /** Keeps every sample of the left channel from now on, from a tap on the audio thread; the app has to be started with `bypassCSP` */
    startRecording?: () => Promise<void>;
    /** The samples since `startRecording` */
    recordedSamples?: () => number[];
    /** Ends the recording and drops its samples */
    stopRecording?: () => void;
  }
}

export const installAudioProbe = () => {
  // the launcher adds this to the context and to the page, so it can run twice on one load: a second tap would count everything twice
  if (window.audioProbe) return;

  const probe: Probe = { sampleRate: 0, windows: [] };
  window.audioProbe = probe;
  let listening = true;
  const connected = new Set<{ node: ScriptProcessorNode; context: BaseAudioContext }>();
  window.listenWithProbe = (on) => {
    // a node that is not connected can not be disconnected
    if (listening === on) return;
    listening = on;
    // the processor is only pulled when it leads to the destination
    connected.forEach(({ node, context }) => Reflect.apply(on ? originalConnect : originalDisconnect, node, [context.destination]));
  };

  const originalConnect = AudioNode.prototype.connect;
  const originalDisconnect = AudioNode.prototype.disconnect;
  const buses = new WeakMap<BaseAudioContext, GainNode>();

  // the context of the player, and what reaches its destination: the one that was connected last, as the player may replace its context
  let tapped: { context: AudioContext; bus: GainNode } | undefined;

  const recorder = `registerProcessor('tunelle-recorder', class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.port.onmessage = () => { this.done = true; };
    }
    process([[left]]) {
      // a processor that goes on answering true is never dropped
      if (this.done) return false;
      this.port.postMessage(left ? left.slice() : new Float32Array(128));
      return true;
    }
  });`;

  // a module registers its processor once for each context
  const withRecorder = new WeakSet<BaseAudioContext>();

  // a script processor drops and repeats blocks when the page is busy, an audio worklet does not. See docs/development/gapless-measurement.md
  window.startRecording = async () => {
    if (!tapped) throw new Error('Nothing was connected to an audio context yet');

    const { context, bus } = tapped;
    const blocks: Float32Array[] = [];
    if (!withRecorder.has(context)) await context.audioWorklet.addModule(URL.createObjectURL(new Blob([recorder], { type: 'text/javascript' })));
    withRecorder.add(context);
    const node = new AudioWorkletNode(context, 'tunelle-recorder');
    node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => blocks.push(data);
    Reflect.apply(originalConnect, bus, [node]);
    // it writes nothing, so nothing is added to what is heard: a node is only run when it leads to the destination
    Reflect.apply(originalConnect, node, [context.destination]);
    window.recordedSamples = () => blocks.flatMap((block) => Array.from(block));
    window.stopRecording = () => {
      node.port.postMessage('stop');
      node.port.onmessage = null;
      Reflect.apply(originalDisconnect, bus, [node]);
      node.disconnect();
      blocks.length = 0;
    };
  };

  // everything that is connected to the destination is connected to the bus too, which the processor listens to
  const busOf = (context: BaseAudioContext) => {
    const existing = buses.get(context);
    if (existing) return existing;

    const bus = context.createGain();
    buses.set(context, bus);
    probe.sampleRate = context.sampleRate;
    if (!(context instanceof AudioContext)) return bus;
    tapped = { context, bus };

    const windowLength = 1024;
    // a script processor needs no module, which the policy of the page (script-src 'self') would refuse a worklet to load from a blob
    const node = context.createScriptProcessor(windowLength, 2, 1);
    node.onaudioprocess = ({ inputBuffer, playbackTime }) => {
      const [samples, right] = [0, 1].map((channel) => Array.from(inputBuffer.getChannelData(channel)));
      const rmsOf = (values: number[]) => Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
      const crossingsOf = (values: number[]) => values.filter((sample, index) => sample >= 0 && (values[index - 1] ?? 0) < 0).length;
      probe.windows.push({
        frame: Math.round(playbackTime * context.sampleRate),
        frames: samples.length,
        rms: rmsOf(samples),
        peak: samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
        crossings: crossingsOf(samples),
        rightRms: rmsOf(right),
        rightCrossings: crossingsOf(right),
      });
    };
    Reflect.apply(originalConnect, bus, [node]);
    const tap = { node, context };
    connected.add(tap);
    // a context that the player replaced is let go, or the test would hold on to every one of them
    context.addEventListener('statechange', () => context.state === 'closed' && connected.delete(tap));
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
