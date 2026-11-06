import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContext } from 'react';
import { renderHook } from '@testing-library/react';

const fakeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const fakeGain = () => ({
  ...fakeNode(),
  gain: { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
});

const setSinkId = vi.fn();
/** The rate of the device with this id; the default device runs at 48 kHz */
const deviceRates: Record<string, number> = {};
/** The ids of the devices that cannot be opened */
const brokenDevices = new Set<string>();

/** A fresh module on a fake AudioContext, which records how the nodes are wired */
const setup = async () => {
  vi.resetModules();
  const source = fakeNode();
  const gains: ReturnType<typeof fakeGain>[] = [];
  const analysers: ReturnType<typeof fakeNode>[] = [];
  const createMediaElementSource = vi.fn(() => source);
  const contexts: { sinkId: string; sampleRate: number; close: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; sinkchange: () => void }[] = [];
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
      sinkId: string;
      sampleRate: number;
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockResolvedValue(undefined);
      sinkchange: () => void = () => undefined;
      addEventListener = (type: string, listener: () => void) => {
        if (type === 'sinkchange') this.sinkchange = listener;
      };
      constructor(options?: { sinkId?: string }) {
        if (brokenDevices.has(options?.sinkId ?? '')) throw new Error('unplugged');
        this.sinkId = options?.sinkId ?? '';
        this.sampleRate = deviceRates[this.sinkId] ?? 48000;
        contexts.push(this);
      }
      setSinkId = setSinkId;
      createMediaElementSource = createMediaElementSource;
      currentTime = 3;
      createGain = () => {
        const gain = fakeGain();
        gains.push(gain);
        return gain;
      };
      createAnalyser = () => {
        const analyser = Object.assign(fakeNode(), { smoothingTimeConstant: 0, fftSize: 0 });
        analysers.push(analyser);
        return analyser;
      };
    }
  );
  const { Audio } = await import('./context');
  // the first gain of the module is the input of the equalizer and the analyser, the next ones level an element each
  const input = gains[0];
  const { result } = renderHook(() => useContext(Audio));
  return { audio: result.current, source, input, gains, analysers, createMediaElementSource, contexts };
};

describe('audio context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('output device', () => {
    beforeEach(() => {
      setSinkId.mockReset().mockResolvedValue(undefined);
      Object.keys(deviceRates).forEach((id) => delete deviceRates[id]);
      brokenDevices.clear();
    });

    describe('at the rate of the context', () => {
      it('moves the sound of the context to the device', async () => {
        const { audio, contexts } = await setup();

        await audio.setOutputDevice('a1');

        expect(setSinkId).toHaveBeenCalledExactlyOnceWith('a1');
        expect(contexts[1].close).toHaveBeenCalledTimes(1);
        expect(contexts[0].close).not.toHaveBeenCalled();
      });

      it('falls back to the system default when the device cannot be opened', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { audio } = await setup();
        setSinkId.mockRejectedValueOnce(new Error('unplugged'));

        await audio.setOutputDevice('a1');

        expect(setSinkId.mock.calls).toEqual([['a1'], ['']]);
      });

      it('leaves the default alone when it is asked for', async () => {
        const { audio, contexts } = await setup();

        await audio.setOutputDevice('');

        expect(setSinkId).not.toHaveBeenCalled();
        expect(contexts).toHaveLength(1);
      });

      it('does not tell the player, as nothing is made again', async () => {
        const { audio } = await setup();
        const listener = vi.fn();
        audio.addOutputChangeListener(listener);

        await audio.setOutputDevice('a1');

        expect(listener).not.toHaveBeenCalled();
      });
    });

    describe('at another rate', () => {
      beforeEach(() => {
        deviceRates.dac = 96000;
      });

      it('replaces the context by one at the rate of the device, and closes the old one', async () => {
        const { audio, contexts } = await setup();

        await audio.setOutputDevice('dac');

        expect(audio.getSampleRate()).toBe(96000);
        expect(setSinkId).not.toHaveBeenCalled();
        expect(contexts[0].close).toHaveBeenCalledTimes(1);
        expect(contexts[1].resume).toHaveBeenCalledTimes(1);
      });

      it('tells the player where the track was and whether it played, with the old elements paused and silent for the status of the player', async () => {
        const { audio } = await setup();
        const node = document.createElement('audio');
        Object.defineProperty(node, 'paused', { value: false });
        Object.defineProperty(node, 'currentTime', { value: 42.5 });
        node.pause = vi.fn();
        const status = vi.fn();
        const listener = vi.fn();
        audio.addPlayStatusListener(status);
        audio.addOutputChangeListener(listener);
        audio.connectNode(node);

        await audio.setOutputDevice('dac');
        node.dispatchEvent(new Event('pause'));

        expect(listener).toHaveBeenCalledExactlyOnceWith({ position: 42.5, wasPlaying: true });
        expect(node.pause).toHaveBeenCalledTimes(1);
        expect(status).not.toHaveBeenCalled();
      });

      it('builds the graph on the new context: the elements can be wrapped again and the analyser is a new one', async () => {
        const { audio, createMediaElementSource, analysers } = await setup();
        const node = document.createElement('audio');
        audio.connectNode(node);
        audio.createAnalyser();

        await audio.setOutputDevice('dac');
        audio.connectNode(document.createElement('audio'));
        audio.createAnalyser();

        expect(createMediaElementSource).toHaveBeenCalledTimes(2);
        expect(analysers).toHaveLength(2);
      });

      it('tells the listeners of the audio that it is mounted again, once the first element of the new context is connected', async () => {
        const { audio } = await setup();
        const mounted = vi.fn();
        audio.onAudioMounted(mounted);
        audio.connectNode(document.createElement('audio'));
        await audio.setOutputDevice('dac');
        expect(mounted).toHaveBeenCalledTimes(1);

        audio.connectNode(document.createElement('audio'));

        expect(mounted).toHaveBeenCalledTimes(2);
      });

      it('registers a listener of the audio once, as a component that mounts twice does', async () => {
        const { audio } = await setup();
        const mounted = vi.fn();
        audio.onAudioMounted(mounted);
        audio.onAudioMounted(mounted);

        audio.connectNode(document.createElement('audio'));

        expect(mounted).toHaveBeenCalledTimes(1);
      });

      it('plays on the default context when the device cannot be opened', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        brokenDevices.add('dac');
        const { audio, contexts } = await setup();

        await audio.setOutputDevice('dac');

        expect(contexts).toHaveLength(2);
        expect(contexts[1].sinkId).toBe('');
        expect(audio.getSampleRate()).toBe(48000);
      });

      it('makes one context when the same device is asked for twice at once', async () => {
        const { audio, contexts } = await setup();
        const listener = vi.fn();
        audio.addOutputChangeListener(listener);

        await Promise.all([audio.setOutputDevice('dac'), audio.setOutputDevice('dac')]);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(contexts.filter(({ sinkId }) => sinkId === 'dac')).toHaveLength(1);
      });
    });
  });

  describe('the default device changes', () => {
    beforeEach(() => {
      setSinkId.mockReset().mockResolvedValue(undefined);
      Object.keys(deviceRates).forEach((id) => delete deviceRates[id]);
      brokenDevices.clear();
    });

    it('replaces the context when the new default runs at another rate', async () => {
      const { audio, contexts } = await setup();
      const listener = vi.fn();
      audio.addOutputChangeListener(listener);
      deviceRates[''] = 96000;

      contexts[0].sinkchange();
      await vi.advanceTimersByTimeAsync(0);

      expect(audio.getSampleRate()).toBe(96000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(contexts[0].close).toHaveBeenCalledTimes(1);
    });

    it('keeps the context when the new default runs at the same rate', async () => {
      const { audio, contexts } = await setup();
      const listener = vi.fn();
      audio.addOutputChangeListener(listener);

      contexts[0].sinkchange();
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).not.toHaveBeenCalled();
      expect(contexts[1].close).toHaveBeenCalledTimes(1);
      expect(contexts[0].close).not.toHaveBeenCalled();
    });

    it('leaves a device that was picked alone, as it is not the default that changed', async () => {
      const { audio, contexts } = await setup();
      await audio.setOutputDevice('a1');
      contexts[0].sinkId = 'a1';

      contexts[0].sinkchange();
      await vi.advanceTimersByTimeAsync(0);

      expect(contexts).toHaveLength(2);
    });

    it('follows the default again on the new context', async () => {
      const { audio, contexts } = await setup();
      deviceRates[''] = 96000;
      contexts[0].sinkchange();
      await vi.advanceTimersByTimeAsync(0);
      deviceRates[''] = 44100;

      contexts[1].sinkchange();
      await vi.advanceTimersByTimeAsync(0);

      expect(audio.getSampleRate()).toBe(44100);
    });
  });

  it('has no analyser before an audio element is connected', async () => {
    const { audio } = await setup();

    expect(audio.createAnalyser()).toBeUndefined();
  });

  it('only listens with the analyser: playing its output would add the signal around the equalizer', async () => {
    const { audio, input, analysers } = await setup();
    audio.connectNode(document.createElement('audio'));

    const analyser = audio.createAnalyser();

    expect(input.connect).toHaveBeenCalledWith(analyser);
    expect(analysers[0].connect).not.toHaveBeenCalled();
  });

  it.each([
    { ended: false, notified: [false] },
    { ended: true, notified: [] },
  ])('reports a pause as a stop of playing only when the track has not ended ($ended)', async ({ ended, notified }) => {
    const { audio } = await setup();
    const node = document.createElement('audio');
    Object.defineProperty(node, 'ended', { value: ended });
    const listener = vi.fn();
    audio.addPlayStatusListener(listener);
    audio.connectNode(node);

    node.dispatchEvent(new Event('pause'));

    expect(listener.mock.calls.map(([playing]) => playing)).toEqual(notified);
  });

  describe('play', () => {
    const connectPlayable = async (play: () => Promise<void>, paused = true) => {
      const { audio } = await setup();
      const node = document.createElement('audio');
      Object.defineProperty(node, 'paused', { value: paused });
      node.play = vi.fn(play);
      audio.connectNode(node);
      return { audio, node };
    };

    it('starts a paused element', async () => {
      const { audio, node } = await connectPlayable(() => Promise.resolve());

      audio.play();

      expect(node.play).toHaveBeenCalledTimes(1);
    });

    it('does not ask an element that plays or starts again', async () => {
      const { audio, node } = await connectPlayable(() => Promise.resolve(), false);

      audio.play();

      expect(node.play).not.toHaveBeenCalled();
    });

    it('does not report a play that was interrupted as an error', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { audio } = await connectPlayable(() => Promise.reject(new DOMException('interrupted by a new load request', 'AbortError')));

      audio.play();
      await vi.advanceTimersByTimeAsync(0);

      expect(error).not.toHaveBeenCalled();
    });

    it('reports a play that failed', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new DOMException('not allowed', 'NotAllowedError');
      const { audio } = await connectPlayable(() => Promise.reject(failure));

      audio.play();
      await vi.advanceTimersByTimeAsync(0);

      expect(error).toHaveBeenCalledWith(failure);
    });
  });

  it('shares one analyser however often it is asked for', async () => {
    const { audio, analysers } = await setup();
    audio.connectNode(document.createElement('audio'));

    expect(audio.createAnalyser()).toBe(audio.createAnalyser());
    expect(analysers).toHaveLength(1);
  });

  it('wraps an audio element once, however often it is connected', async () => {
    const { audio, createMediaElementSource } = await setup();
    const element = document.createElement('audio');

    audio.connectNode(element);
    audio.connectNode(null);
    audio.connectNode(element);

    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  describe('with a second element that takes over', () => {
    const connectTwo = async () => {
      const { audio, input, createMediaElementSource } = await setup();
      const [playing, standby] = [document.createElement('audio'), document.createElement('audio')];
      const listener = vi.fn();
      audio.addPlayStatusListener(listener);
      audio.connectNode(playing);
      audio.connectStandbyNode(standby);
      return { audio, input, createMediaElementSource, playing, standby, listener };
    };

    it('wraps both elements into the same input', async () => {
      const { input, createMediaElementSource } = await connectTwo();

      expect(createMediaElementSource).toHaveBeenCalledTimes(2);
      expect(input.connect).not.toHaveBeenCalled();
    });

    it('does not report the play and the pause of the element that waits', async () => {
      const { standby, listener } = await connectTwo();

      standby.dispatchEvent(new Event('play'));
      standby.dispatchEvent(new Event('pause'));

      expect(listener).not.toHaveBeenCalled();
    });

    it('reports the element that plays after it took over, and no more the one it took over from', async () => {
      const { audio, playing, standby, listener } = await connectTwo();
      audio.activateNode(standby);

      playing.dispatchEvent(new Event('pause'));
      standby.dispatchEvent(new Event('pause'));

      expect(listener.mock.calls).toEqual([[false]]);
    });

    it('wraps an element that takes over once', async () => {
      const { audio, standby, createMediaElementSource } = await connectTwo();

      audio.activateNode(standby);
      audio.connectStandbyNode(standby);

      expect(createMediaElementSource).toHaveBeenCalledTimes(2);
    });

    it('pauses both elements', async () => {
      const { audio, playing, standby } = await connectTwo();
      playing.pause = vi.fn();
      standby.pause = vi.fn();

      audio.pause();

      expect(playing.pause).toHaveBeenCalledTimes(1);
      expect(standby.pause).toHaveBeenCalledTimes(1);
    });

    it('starts the element that plays now', async () => {
      const { audio, standby } = await connectTwo();
      Object.defineProperty(standby, 'paused', { value: true });
      standby.play = vi.fn().mockResolvedValue(undefined);
      audio.activateNode(standby);

      audio.play();

      expect(standby.play).toHaveBeenCalledTimes(1);
    });
  });

  it('levels every element before its sound joins the input', async () => {
    const { audio, source, input, gains } = await setup();
    audio.connectNode(document.createElement('audio'));

    const [, normalizer] = gains;
    expect(source.connect).toHaveBeenCalledWith(normalizer);
    expect(normalizer.connect).toHaveBeenCalledWith(input);
  });

  it('sets the level of an element that is not playing at once', async () => {
    const { audio, gains } = await setup();
    const node = document.createElement('audio');
    Object.defineProperty(node, 'paused', { value: true });
    audio.connectNode(node);

    audio.setNormalization(node, 0.5);

    expect(gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.5, 3);
    expect(gains[1].gain.setTargetAtTime).not.toHaveBeenCalled();
  });

  it('glides to the level of an element that plays, so a change of the mode does not click', async () => {
    const { audio, gains } = await setup();
    const node = document.createElement('audio');
    Object.defineProperty(node, 'paused', { value: false });
    audio.connectNode(node);

    audio.setNormalization(node, 0.5);

    expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 3, expect.any(Number));
    expect(gains[1].gain.setValueAtTime).not.toHaveBeenCalled();
  });

  it('leaves an element that is not connected alone', async () => {
    const { audio, gains } = await setup();

    audio.setNormalization(document.createElement('audio'), 0.5);

    expect(gains).toHaveLength(1);
  });
});
