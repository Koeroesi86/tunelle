import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { NowPlaying } from '@shared/schemas/now-playing';
import { toRemoteTrack } from '../domain/remote-track';
import { useRemoteFollow } from './use-remote-follow';

const playing: NowPlaying = { state: 'playing', title: 'Song', artist: 'Band', album: 'LP', position: 10, at: 1_000, duration: 200 };
const remote = toRemoteTrack({ ...playing, state: 'playing' });
const local = { ...remote, path: '/music/a.flac' };

const player = (overrides: Partial<Parameters<typeof useRemoteFollow>[1]> = {}) => ({
  currentSong: remote,
  isPlaying: true,
  currentTime: 10,
  play: vi.fn(),
  pause: vi.fn(),
  setCurrentTime: vi.fn(),
  load: vi.fn(),
  leave: vi.fn(),
  ...overrides,
});

describe('useRemoteFollow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
  });

  it('does nothing while another track plays', () => {
    const target = player({ currentSong: local });
    renderHook(() => useRemoteFollow({ ...playing, title: 'Other' }, target));

    expect(target.load).not.toHaveBeenCalled();
    expect(target.setCurrentTime).not.toHaveBeenCalled();
    expect(target.pause).not.toHaveBeenCalled();
  });

  it('leaves the session when a track of this app is loaded after the one of the host, and not before or between remote ones', () => {
    const target = player({ currentSong: local });
    const { rerender } = renderHook(({ current }) => useRemoteFollow(undefined, { ...target, currentSong: current }), { initialProps: { current: local } });
    rerender({ current: remote });
    rerender({ current: toRemoteTrack({ ...playing, title: 'Next' }) });
    expect(target.leave).not.toHaveBeenCalled();

    rerender({ current: local });

    expect(target.leave).toHaveBeenCalledTimes(1);
  });

  it('pauses what is buffered when the session with the host ends, and does nothing while another track plays', () => {
    const ended = player();
    renderHook(() => useRemoteFollow(undefined, ended));
    expect(ended.pause).toHaveBeenCalledTimes(1);

    const other = player({ currentSong: local });
    renderHook(() => useRemoteFollow(undefined, other));
    expect(other.pause).not.toHaveBeenCalled();
  });

  it('loads the next track of the host', () => {
    const target = player();
    renderHook(() => useRemoteFollow({ ...playing, title: 'Other' }, target));

    expect(target.load).toHaveBeenCalledWith(expect.objectContaining({ title: 'Other' }));
  });

  it('plays when the host plays and pauses when it pauses', () => {
    const stopped = player({ isPlaying: false });
    renderHook(() => useRemoteFollow(playing, stopped));
    expect(stopped.play).toHaveBeenCalled();

    const running = player();
    renderHook(() => useRemoteFollow({ ...playing, state: 'paused' }, running));
    expect(running.pause).toHaveBeenCalled();
  });

  it('pauses when nothing plays on the host', () => {
    const target = player();
    renderHook(() => useRemoteFollow({ state: 'idle' }, target));

    expect(target.pause).toHaveBeenCalled();
  });

  it('seeks to where the host is when it is further away than the drift', () => {
    const target = player({ currentTime: 40 });
    renderHook(() => useRemoteFollow(playing, target));

    expect(target.setCurrentTime).toHaveBeenCalledWith(10);
  });

  it('does not seek a station, which has no position', () => {
    const station: NowPlaying = { state: 'playing', title: 'FM', position: 500, at: 1_000, live: true };
    const target = player({ currentSong: toRemoteTrack({ ...station, state: 'playing' }), currentTime: 3 });
    renderHook(() => useRemoteFollow(station, target));

    expect(target.setCurrentTime).not.toHaveBeenCalled();
  });

  it('leaves the position alone when it is close', () => {
    const target = player({ currentTime: 10.2 });
    renderHook(() => useRemoteFollow(playing, target));

    expect(target.setCurrentTime).not.toHaveBeenCalled();
  });

  it('catches up with the host after the track is loaded, and keeps following while the listener is paused', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(1_000);
    const target = player({ isPlaying: false, currentTime: 0 });
    const { rerender } = renderHook(({ current }) => useRemoteFollow(playing, { ...target, currentTime: current }), { initialProps: { current: 0 } });
    expect(target.setCurrentTime).toHaveBeenLastCalledWith(10);

    // the host went on for a minute without a new snapshot
    vi.setSystemTime(61_000);
    rerender({ current: 10 });
    vi.advanceTimersByTime(1000);

    expect(target.setCurrentTime).toHaveBeenLastCalledWith(71);
  });
});
