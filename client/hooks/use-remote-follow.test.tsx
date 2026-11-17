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

  it('leaves the position alone when it is close', () => {
    const target = player({ currentTime: 10.2 });
    renderHook(() => useRemoteFollow(playing, target));

    expect(target.setCurrentTime).not.toHaveBeenCalled();
  });
});
