import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteHost } from './use-remote-host';

const send = vi.fn();
const on = vi.fn();
const info = {
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  path: '/music/song.flac',
  station: undefined,
  coverKey: 'abc-optimized.png',
  next: { title: 'After', artist: undefined },
};
const commands = () => ({
  play: vi.fn(),
  pause: vi.fn(),
  isPlaying: false,
  previousSong: vi.fn(),
  nextSong: vi.fn(),
  setCurrentTime: vi.fn(),
  setVolume: vi.fn(),
});
const control = (payload: unknown) => on.mock.calls.find(([channel]) => channel === 'REMOTE_CONTROL')?.[1](payload);

describe('useRemoteHost', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    window.electronAPI = { send, on, getPathForFile: () => '', blurred: false, mpris: false };
  });

  it('sends the track with its path and where it is', () => {
    renderHook(() => useRemoteHost(info, { isPlaying: true, currentTime: 12, volume: 1 }, commands()));

    expect(send).toHaveBeenCalledWith('REMOTE_STATE', {
      state: 'playing',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 200,
      position: 12,
      at: 1_000,
      path: '/music/song.flac',
      station: undefined,
      coverKey: 'abc-optimized.png',
      volume: 1,
      next: { title: 'After', artist: undefined },
    });
  });

  it('sends the track again with the new volume when the host changes it', () => {
    const { rerender } = renderHook(({ volume }) => useRemoteHost(info, { isPlaying: true, currentTime: 5, volume }, commands()), {
      initialProps: { volume: 1 },
    });

    rerender({ volume: 0.4 });

    expect(send).toHaveBeenLastCalledWith('REMOTE_STATE', expect.objectContaining({ volume: 0.4 }));
  });

  it('sends the uuid of a station and no path or duration', () => {
    renderHook(() =>
      useRemoteHost(
        { ...info, path: undefined, duration: 0, station: 'b3f1c1a0-0000-4000-8000-000000000001' },
        { isPlaying: true, currentTime: 12, volume: 1 },
        commands()
      )
    );

    expect(send).toHaveBeenCalledWith(
      'REMOTE_STATE',
      expect.objectContaining({ station: 'b3f1c1a0-0000-4000-8000-000000000001', path: undefined, duration: undefined })
    );
  });

  it('sends a paused track again when it stops', () => {
    const { rerender } = renderHook(({ isPlaying }) => useRemoteHost(info, { isPlaying, currentTime: 5, volume: 1 }, commands()), {
      initialProps: { isPlaying: true },
    });

    rerender({ isPlaying: false });

    expect(send).toHaveBeenLastCalledWith('REMOTE_STATE', expect.objectContaining({ state: 'paused', position: 5 }));
  });

  it('sends idle when nothing plays, and no duration for a station', () => {
    renderHook(() => useRemoteHost(undefined, { isPlaying: false, currentTime: 0, volume: 1 }, commands()));
    renderHook(() => useRemoteHost({ ...info, duration: 0, path: undefined }, { isPlaying: true, currentTime: 0, volume: 1 }, commands()));

    expect(send).toHaveBeenCalledWith('REMOTE_STATE', { state: 'idle' });
    expect(send).toHaveBeenLastCalledWith('REMOTE_STATE', expect.objectContaining({ duration: undefined, path: undefined }));
  });

  it('sends the state again on a seek, not while the playback runs on', () => {
    const { rerender } = renderHook(({ currentTime }) => useRemoteHost(info, { isPlaying: true, currentTime, volume: 1 }, commands()), {
      initialProps: { currentTime: 0 },
    });
    send.mockClear();

    vi.setSystemTime(2_000);
    rerender({ currentTime: 1 });
    expect(send).not.toHaveBeenCalled();

    rerender({ currentTime: 90 });
    expect(send).toHaveBeenCalledWith('REMOTE_STATE', expect.objectContaining({ position: 90 }));
  });

  it.each([
    [{ control: 'playPause', action: 'toggle' }, false, 'play'],
    [{ control: 'playPause', action: 'toggle' }, true, 'pause'],
    [{ control: 'playPause', action: 'play' }, true, 'play'],
    [{ control: 'playPause', action: 'pause' }, false, 'pause'],
    [{ control: 'skip', direction: 'next' }, false, 'nextSong'],
    [{ control: 'skip', direction: 'previous' }, false, 'previousSong'],
  ] as const)('runs %j while playing is %s as %s', (command, isPlaying, called) => {
    const current = { ...commands(), isPlaying };
    renderHook(() => useRemoteHost(info, { isPlaying, currentTime: 0, volume: 1 }, current));

    control(command);

    expect(current[called]).toHaveBeenCalledTimes(1);
  });

  it('seeks and sets the volume', () => {
    const current = commands();
    renderHook(() => useRemoteHost(info, { isPlaying: true, currentTime: 0, volume: 1 }, current));

    control({ control: 'seek', position: 42 });
    control({ control: 'volume', level: 0.3 });

    expect(current.setCurrentTime).toHaveBeenCalledWith(42);
    expect(current.setVolume).toHaveBeenCalledWith(0.3);
  });

  it('drops a command of the wrong shape and listens once', () => {
    const current = commands();
    const { rerender } = renderHook(() => useRemoteHost(info, { isPlaying: true, currentTime: 0, volume: 1 }, current));
    rerender();

    control({ control: 'volume', level: 4 });
    control({ control: 'eject' });

    expect(on.mock.calls.filter(([channel]) => channel === 'REMOTE_CONTROL')).toHaveLength(1);
    expect(current.setVolume).not.toHaveBeenCalled();
  });
});
