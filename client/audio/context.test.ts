import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContext } from 'react';
import { renderHook } from '@testing-library/react';

const fakeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const fakeGain = () => ({
  ...fakeNode(),
  gain: { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
});

const setSinkId = vi.fn();

/** A fresh module on a fake AudioContext, which records how the nodes are wired */
const setup = async () => {
  vi.resetModules();
  const source = fakeNode();
  const gains: ReturnType<typeof fakeGain>[] = [];
  const analysers: ReturnType<typeof fakeNode>[] = [];
  const createMediaElementSource = vi.fn(() => source);
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
      sinkId = '';
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
  return { audio: result.current, source, input, gains, analysers, createMediaElementSource };
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
    beforeEach(() => setSinkId.mockReset().mockResolvedValue(undefined));

    it('moves the sound of the context to the device', async () => {
      const { audio } = await setup();

      await audio.setOutputDevice('a1');

      expect(setSinkId).toHaveBeenCalledExactlyOnceWith('a1');
    });

    it('falls back to the system default when the device cannot be opened', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { audio } = await setup();
      setSinkId.mockRejectedValueOnce(new Error('unplugged'));

      await audio.setOutputDevice('a1');

      expect(setSinkId.mock.calls).toEqual([['a1'], ['']]);
    });

    it('leaves the default alone when it is asked for', async () => {
      const { audio } = await setup();

      await audio.setOutputDevice('');

      expect(setSinkId).not.toHaveBeenCalled();
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
