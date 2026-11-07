import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../../../domain/radio-track';
import type { NormalizationMode } from '../../../audio/loudness';
import AudioComponent from './AudioComponent';

const station = toRadioTrack({ uuid: 'abc-1', name: 'Jazz FM', country: 'UK', tags: ['jazz'], codec: 'MP3', bitrate: 128 });

const renderAudio = (currentSong: Track | null, isPlaying = false) =>
  render(
    <AudioComponent
      devices={[]}
      currentSong={currentSong}
      isPlaying={isPlaying}
      volume={1}
      trackEnded={vi.fn()}
      connectNode={vi.fn()}
      connectStandbyNode={vi.fn()}
      activateNode={vi.fn()}
      normalization="album"
      setNormalization={vi.fn()}
      outputDevice={undefined}
      setOutputDevice={vi.fn().mockResolvedValue(undefined)}
      addOutputChangeListener={vi.fn()}
      removeOutputChangeListener={vi.fn()}
      upNext={null}
    />
  );

describe('AudioComponent', () => {
  let play: MockInstance<HTMLMediaElement['play']>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });
  it('does not start a track by itself when it is loaded paused, as a restored track is', () => {
    const { container } = renderAudio(null);

    expect(container.querySelector('audio')?.autoplay).toBe(false);
  });

  it('keeps a restored track paused', () => {
    const view = renderAudio(null);
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={false}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    expect(play).not.toHaveBeenCalled();
  });

  it('plays a track that was asked to play once its source is set', () => {
    const view = renderAudio(null);
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('lets go of a station when it is paused and connects again when it plays', () => {
    const view = renderAudio(null);
    const element = view.container.querySelector('audio');
    const props = (isPlaying: boolean) => (
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={isPlaying}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    view.rerender(props(true));
    expect(element?.hasAttribute('src')).toBe(true);

    view.rerender(props(false));
    expect(element?.hasAttribute('src')).toBe(false);

    play.mockClear();
    view.rerender(props(true));
    expect(element?.getAttribute('src')).toContain('/radio/abc-1');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps the source of a file track when it is paused', () => {
    const file: Track = { ...station, path: '/music/a.flac' };
    const view = renderAudio(null);
    const element = view.container.querySelector('audio');
    const props = (isPlaying: boolean) => (
      <AudioComponent
        devices={[]}
        currentSong={file}
        isPlaying={isPlaying}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    view.rerender(props(true));
    view.rerender(props(false));

    expect(element?.hasAttribute('src')).toBe(true);
  });

  it('does not load a station again when play comes while it still holds its source', () => {
    const view = renderAudio(null);
    const props = (isPlaying: boolean) => (
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={isPlaying}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    view.rerender(props(false));
    play.mockClear();
    view.rerender(props(true));

    expect(play).not.toHaveBeenCalled();
  });

  it('logs a station that cannot connect again after a pause', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('offline');
    const view = renderAudio(null);
    const props = (isPlaying: boolean) => (
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={isPlaying}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    view.rerender(props(true));
    view.rerender(props(false));
    play.mockRejectedValueOnce(failure);
    view.rerender(props(true));

    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(failure));
    error.mockRestore();
  });

  it('plays a station through the local server', () => {
    const view = renderAudio(null);
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={false}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    expect(view.container.querySelector('audio')?.src).toBe('tunelle://app/radio/abc-1');
  });
});

describe('AudioComponent without a track', () => {
  const props = (currentSong: Track | null) => (
    <AudioComponent
      devices={[]}
      currentSong={currentSong}
      isPlaying={false}
      volume={1}
      trackEnded={vi.fn()}
      connectNode={vi.fn()}
      connectStandbyNode={vi.fn()}
      activateNode={vi.fn()}
      normalization="album"
      setNormalization={vi.fn()}
      outputDevice={undefined}
      setOutputDevice={vi.fn().mockResolvedValue(undefined)}
      addOutputChangeListener={vi.fn()}
      removeOutputChangeListener={vi.fn()}
      upNext={null}
    />
  );

  it('empties the element when the track goes away, as an empty src makes it fail', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const view = render(props(null));
    const element = view.container.querySelector('audio');
    view.rerender(props({ ...station, path: '/music/a.flac' }));
    expect(element?.hasAttribute('src')).toBe(true);
    load.mockClear();

    view.rerender(props(null));

    expect(element?.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalled();
  });
});

describe('AudioComponent end of a track', () => {
  const track: Track = { ...station, path: '/music/a.flac' };
  const other: Track = { ...station, path: '/music/b.flac' };
  const trackEnded = vi.fn();
  const element = (view: ReturnType<typeof render>) => view.container.querySelector('audio') as HTMLAudioElement;
  const renderTrack = (song: Track) =>
    render(
      <AudioComponent
        devices={[]}
        currentSong={song}
        isPlaying={false}
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

  beforeEach(() => trackEnded.mockClear());
  it('steps to the next track once however often the end is reached', () => {
    const view = renderTrack(track);

    fireEvent.ended(element(view));
    fireEvent.ended(element(view));
    fireEvent.ended(element(view));

    expect(trackEnded).toHaveBeenCalledTimes(1);
  });

  it('steps again at the end of the next track', () => {
    const view = renderTrack(track);
    fireEvent.ended(element(view));
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={other}
        isPlaying={false}
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    fireEvent.ended(element(view));

    expect(trackEnded).toHaveBeenCalledTimes(2);
  });

  it('steps again when the same track is played again', () => {
    const view = renderTrack(track);
    fireEvent.ended(element(view));
    fireEvent.play(element(view));

    fireEvent.ended(element(view));

    expect(trackEnded).toHaveBeenCalledTimes(2);
  });
});

describe('AudioComponent radio reconnect', () => {
  let play: MockInstance<HTMLMediaElement['play']>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const playStation = () => {
    const view = renderAudio(null);
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    play.mockClear();
    return view.container.querySelector('audio') as HTMLAudioElement;
  };

  describe('catching up to the live stream', () => {
    const buffer = (element: HTMLAudioElement, end: number, currentTime: number) => {
      Object.defineProperty(element, 'buffered', { configurable: true, value: { length: 1, end: () => end } });
      Object.defineProperty(element, 'paused', { configurable: true, value: false });
      element.currentTime = currentTime;
      fireEvent.timeUpdate(element);
    };

    it('continues with the newest audio when a station plays far behind it', () => {
      const element = playStation();

      buffer(element, 100, 60);

      expect(element.currentTime).toBe(99);
    });

    it('leaves a station alone that plays close to the newest audio', () => {
      const element = playStation();

      buffer(element, 100, 95);

      expect(element.currentTime).toBe(95);
    });
  });

  it('asks a station again when its stream ends', () => {
    const audio = playStation();

    fireEvent.ended(audio);
    vi.advanceTimersByTime(1000);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('asks a station again when its stream fails, with a longer pause each time', () => {
    const audio = playStation();

    fireEvent.error(audio);
    vi.advanceTimersByTime(1000);
    fireEvent.error(audio);
    vi.advanceTimersByTime(1000);

    expect(play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not ask a station again once it was paused', () => {
    const view = renderAudio(null);
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );
    play.mockClear();
    view.rerender(
      <AudioComponent
        devices={[]}
        currentSong={station}
        isPlaying={false}
        volume={1}
        trackEnded={vi.fn()}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    fireEvent.error(view.container.querySelector('audio') as HTMLAudioElement);
    vi.advanceTimersByTime(60_000);

    expect(play).not.toHaveBeenCalled();
  });

  it('still moves on when a file ends', () => {
    const trackEnded = vi.fn();
    const file = { ...station, path: '/music/a.flac' };
    const view = render(
      <AudioComponent
        devices={[]}
        currentSong={file}
        isPlaying
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    fireEvent.ended(view.container.querySelector('audio') as HTMLAudioElement);

    expect(trackEnded).toHaveBeenCalledTimes(1);
  });

  it('moves on to the next track when a file cannot be played', () => {
    const trackEnded = vi.fn();
    const file = { ...station, path: '/mnt/usb/a.flac' };
    const view = render(
      <AudioComponent
        devices={[]}
        currentSong={file}
        isPlaying
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    fireEvent.error(view.container.querySelector('audio') as HTMLAudioElement);

    expect(trackEnded).toHaveBeenCalledTimes(1);
  });

  it('does not move on from a restored track that is paused', () => {
    const trackEnded = vi.fn();
    const file = { ...station, path: '/mnt/usb/a.flac' };
    const view = render(
      <AudioComponent
        devices={[]}
        currentSong={file}
        isPlaying={false}
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    fireEvent.error(view.container.querySelector('audio') as HTMLAudioElement);

    expect(trackEnded).not.toHaveBeenCalled();
  });

  it('stops moving on after a run of files that cannot be played', () => {
    const trackEnded = vi.fn();
    const file = { ...station, path: '/mnt/usb/a.flac' };
    const view = render(
      <AudioComponent
        devices={[]}
        currentSong={file}
        isPlaying
        volume={1}
        trackEnded={trackEnded}
        connectNode={vi.fn()}
        connectStandbyNode={vi.fn()}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={vi.fn()}
        removeOutputChangeListener={vi.fn()}
        upNext={null}
      />
    );

    Array.from({ length: 30 }).forEach(() => fireEvent.error(view.container.querySelector('audio') as HTMLAudioElement));

    expect(trackEnded).toHaveBeenCalledTimes(10);
  });
});

describe('AudioComponent gapless', () => {
  const first: Track = { ...station, path: '/music/a.flac' };
  const second: Track = { ...station, path: '/music/b.flac' };
  const third: Track = { ...station, path: '/music/c.flac' };
  const sourceOfPath = (path: string) => `tunelle://app/track?path=${encodeURIComponent(path)}`;
  const trackEnded = vi.fn();
  const activateNode = vi.fn();

  const setNormalization = vi.fn();

  const props = (currentSong: Track | null, upNext: Track | null, isPlaying = true, normalization: NormalizationMode = 'album') => (
    <AudioComponent
      devices={[]}
      currentSong={currentSong}
      isPlaying={isPlaying}
      volume={1}
      normalization={normalization}
      upNext={upNext}
      trackEnded={trackEnded}
      connectNode={vi.fn()}
      connectStandbyNode={vi.fn()}
      activateNode={activateNode}
      setNormalization={setNormalization}
      outputDevice={undefined}
      setOutputDevice={vi.fn().mockResolvedValue(undefined)}
      addOutputChangeListener={vi.fn()}
      removeOutputChangeListener={vi.fn()}
    />
  );

  const defineProperties = (node: HTMLAudioElement, values: Record<string, unknown>) =>
    Object.entries(values).forEach(([key, value]) => Object.defineProperty(node, key, { value, configurable: true }));

  /** The element that plays the first track, with the second loaded and ready, in the middle of a track of 10 s */
  const playFirstOfTwo = (upNext: Track | null = second, ready = true) => {
    const view = render(props(null, null));
    view.rerender(props(first, null));
    view.rerender(props(first, upNext));
    const [playing, standby] = Array.from(view.container.querySelectorAll('audio'));
    standby.play = vi.fn().mockResolvedValue(undefined);
    defineProperties(playing, { duration: 10, currentTime: 4, paused: false });
    defineProperties(standby, { readyState: ready ? 4 : 0 });
    fireEvent.timeUpdate(playing);
    return { view, playing, standby };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    trackEnded.mockClear();
    activateNode.mockClear();
    setNormalization.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the track that follows into the second element', () => {
    const { standby } = playFirstOfTwo();

    expect(standby.src).toBe(sourceOfPath(second.path));
  });

  it('loads nothing after a station, as it has no end', () => {
    const view = render(props(null, null));
    view.rerender(props(station, second));

    expect(view.container.querySelectorAll('audio')[1].getAttribute('src')).toBeNull();
  });

  it('loads nothing for a station that follows', () => {
    const view = render(props(null, null));
    view.rerender(props(first, station));

    expect(view.container.querySelectorAll('audio')[1].getAttribute('src')).toBeNull();
  });

  it('starts the next track the lead before the end of the current one, not earlier', () => {
    const { standby } = playFirstOfTwo();

    vi.advanceTimersByTime(5800);
    expect(standby.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(standby.play).toHaveBeenCalledTimes(1);
  });

  it('steps to the next track once, when the second element plays, and the track that ends afterwards does not step again', () => {
    const { playing, standby } = playFirstOfTwo();
    vi.advanceTimersByTime(6000);

    fireEvent.playing(standby);
    fireEvent.ended(playing);

    expect(trackEnded).toHaveBeenCalledTimes(1);
    expect(activateNode).toHaveBeenCalledWith(standby);
  });

  it('does not step when the current one ends while the next one is starting', () => {
    const { playing } = playFirstOfTwo();
    vi.advanceTimersByTime(6000);

    fireEvent.ended(playing);

    expect(trackEnded).not.toHaveBeenCalled();
  });

  it('keeps the track that plays when the state follows, instead of loading it again', () => {
    const { view, playing, standby } = playFirstOfTwo();
    vi.advanceTimersByTime(6000);
    fireEvent.playing(standby);
    (standby.play as ReturnType<typeof vi.fn>).mockClear();

    view.rerender(props(second, third));

    expect(standby.src).toBe(sourceOfPath(second.path));
    expect(standby.play).not.toHaveBeenCalled();
    expect(playing.src).toBe(sourceOfPath(first.path));
  });

  it('loads the track after that into the element that finished, once it ended', () => {
    const { view, playing, standby } = playFirstOfTwo();
    vi.advanceTimersByTime(6000);
    fireEvent.playing(standby);
    view.rerender(props(second, third));
    defineProperties(playing, { paused: false });

    expect(playing.src).toBe(sourceOfPath(first.path));

    defineProperties(playing, { paused: true });
    fireEvent.ended(playing);

    expect(playing.src).toBe(sourceOfPath(third.path));
  });

  it('follows the usual way when the next track is not ready in time', () => {
    const { playing, standby } = playFirstOfTwo(second, false);
    vi.advanceTimersByTime(6000);

    fireEvent.ended(playing);

    expect(standby.play).not.toHaveBeenCalled();
    expect(trackEnded).toHaveBeenCalledTimes(1);
  });

  it('follows the usual way when the second element cannot start', async () => {
    const { playing, standby } = playFirstOfTwo();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    standby.play = vi.fn().mockRejectedValue(new DOMException('not allowed', 'NotAllowedError'));
    vi.advanceTimersByTime(6000);
    await vi.advanceTimersByTimeAsync(0);

    defineProperties(playing, { ended: true });
    fireEvent.ended(playing);

    expect(trackEnded).toHaveBeenCalledTimes(1);
  });

  it('does not start the next track when the current one is paused', () => {
    const { playing, standby } = playFirstOfTwo();
    fireEvent.pause(playing);

    vi.advanceTimersByTime(6000);

    expect(standby.play).not.toHaveBeenCalled();
  });

  it('starts the next track earlier after a seek towards the end', () => {
    const { playing, standby } = playFirstOfTwo();
    defineProperties(playing, { currentTime: 9 });
    fireEvent.timeUpdate(playing);

    vi.advanceTimersByTime(900);

    expect(standby.play).toHaveBeenCalledTimes(1);
  });

  it('continues in the second element when the user asks for the track that it holds', () => {
    const { view, playing, standby } = playFirstOfTwo();

    view.rerender(props(second, third));

    expect(standby.play).toHaveBeenCalledTimes(1);
    expect(activateNode).toHaveBeenCalledWith(standby);
    expect(playing.src).toBe(sourceOfPath(first.path));
  });

  it('loads a track that the second element does not hold into the playing one', () => {
    const { view, playing } = playFirstOfTwo();

    view.rerender(props(third, null));

    expect(playing.src).toBe(sourceOfPath(third.path));
    expect(activateNode).not.toHaveBeenCalled();
  });

  it('loads a track that the second element failed to load into the playing one', () => {
    const { view, playing, standby } = playFirstOfTwo();
    fireEvent.error(standby);

    view.rerender(props(second, third));

    expect(playing.src).toBe(sourceOfPath(second.path));
    expect(trackEnded).not.toHaveBeenCalled();
  });

  it('chooses another track to load when the queue changes', () => {
    const { view, standby } = playFirstOfTwo();

    view.rerender(props(first, third));

    expect(standby.src).toBe(sourceOfPath(third.path));
  });

  describe('loudness normalization', () => {
    const quiet: Track = { ...second, trackGain: -6, trackPeak: 0.5, albumGain: -6, albumPeak: 0.5 };
    const half = 10 ** (-6 / 20);

    it('levels the element that plays and the one that loads the next track, each for its own track', () => {
      const view = render(props(null, null));
      view.rerender(props(first, null));
      view.rerender(props(first, quiet));
      const [playing, standby] = Array.from(view.container.querySelectorAll('audio'));

      expect(setNormalization).toHaveBeenLastCalledWith(standby, expect.closeTo(half));
      expect(setNormalization).toHaveBeenCalledWith(playing, 1);
    });

    it('levels a track from the loudness the library gives, as the lists do not carry it', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              codec: 'FLAC',
              bitDepth: 16,
              sampleRate: 44100,
              bitrate: null,
              vbr: null,
              lossless: 1,
              trackGain: -6,
              albumGain: -6,
              trackPeak: 0.5,
              albumPeak: 0.5,
            }),
        })
      );
      const view = render(props(null, null));
      view.rerender(props(first, null));

      // the timers are fake here, so the answer is let through by hand
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(setNormalization).toHaveBeenCalledWith(view.container.querySelectorAll('audio')[0], expect.closeTo(half));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/library/track?path='));
      view.unmount();
      vi.unstubAllGlobals();
    });

    it('follows a change of the mode in both elements', () => {
      const view = render(props(null, null));
      view.rerender(props(first, quiet));
      const standby = view.container.querySelectorAll('audio')[1];

      view.rerender(props(first, quiet, true, 'off'));

      expect(setNormalization).toHaveBeenLastCalledWith(standby, 1);
    });
  });
});

describe('AudioComponent output device', () => {
  const dac = { id: 'a1', label: 'USB DAC' };
  const outputProps = (setOutputDevice: (id: string) => Promise<void>, devices: { id: string; label: string }[] = []) => (
    <AudioComponent
      devices={devices}
      currentSong={null}
      isPlaying={false}
      volume={1}
      trackEnded={vi.fn()}
      connectNode={vi.fn()}
      connectStandbyNode={vi.fn()}
      activateNode={vi.fn()}
      normalization="album"
      setNormalization={vi.fn()}
      outputDevice={dac}
      setOutputDevice={setOutputDevice}
      addOutputChangeListener={vi.fn()}
      removeOutputChangeListener={vi.fn()}
      upNext={null}
    />
  );
  const renderOutput = (setOutputDevice: (id: string) => Promise<void>) => render(outputProps(setOutputDevice));

  it('plays on the default until the saved device is found, then moves to it', async () => {
    const setOutputDevice = vi.fn().mockResolvedValue(undefined);
    const view = renderOutput(setOutputDevice);
    expect(setOutputDevice).toHaveBeenLastCalledWith('');

    view.rerender(outputProps(setOutputDevice, [dac]));

    expect(setOutputDevice).toHaveBeenLastCalledWith('a1');
  });

  it('does not fail when the device cannot be set', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderOutput(() => Promise.reject(new Error('gone')));

    await waitFor(() => expect(error).toHaveBeenCalled());
  });
});

describe('AudioComponent audio context replaced', () => {
  const file: Track = { ...station, path: '/music/a.flac' };

  const renderPlaying = (currentSong: Track, isPlaying: boolean) => {
    const listeners = new Set<(resume: { position: number; wasPlaying: boolean }) => void>();
    const connectNode = vi.fn();
    const connectStandbyNode = vi.fn();
    const view = render(
      <AudioComponent
        devices={[]}
        currentSong={currentSong}
        isPlaying={isPlaying}
        volume={0.5}
        trackEnded={vi.fn()}
        connectNode={connectNode}
        connectStandbyNode={connectStandbyNode}
        activateNode={vi.fn()}
        normalization="album"
        setNormalization={vi.fn()}
        outputDevice={undefined}
        setOutputDevice={vi.fn().mockResolvedValue(undefined)}
        addOutputChangeListener={(listener) => listeners.add(listener)}
        removeOutputChangeListener={(listener) => listeners.delete(listener)}
        upNext={null}
      />
    );
    const elements = () => Array.from(view.container.querySelectorAll('audio'));
    const replace = (resume: { position: number; wasPlaying: boolean }) => act(() => listeners.forEach((listener) => listener(resume)));
    return { view, listeners, connectNode, connectStandbyNode, elements, replace };
  };

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  it('makes new elements for the new context, connects them and continues the track where it was', () => {
    const { elements, replace, connectNode, connectStandbyNode } = renderPlaying(file, true);
    const before = elements();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();

    replace({ position: 42.5, wasPlaying: true });

    const after = elements();
    expect(after).toHaveLength(2);
    expect(after.some((node) => before.includes(node))).toBe(false);
    expect(connectNode).toHaveBeenLastCalledWith(after[0]);
    expect(connectStandbyNode).toHaveBeenLastCalledWith(after[1]);
    expect(after[0].getAttribute('src')).toContain(encodeURIComponent('/music/a.flac'));
    expect(after[0].currentTime).toBe(42.5);
    expect(after[0].volume).toBe(0.5);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('stays paused when it was paused', () => {
    const { elements, replace } = renderPlaying(file, false);
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();

    replace({ position: 10, wasPlaying: false });

    expect(elements()[0].getAttribute('src')).toContain(encodeURIComponent('/music/a.flac'));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('plays a station from the live edge, with no position to go back to', () => {
    const { elements, replace } = renderPlaying(station, true);

    replace({ position: 300, wasPlaying: true });

    expect(elements()[0].currentTime).toBe(0);
    expect(elements()[0].getAttribute('src')).toContain('/radio/abc-1');
  });

  it('stops listening when it goes', () => {
    const { view, listeners } = renderPlaying(file, false);
    expect(listeners.size).toBe(1);

    view.unmount();

    expect(listeners.size).toBe(0);
  });
});
