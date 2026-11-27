import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '../reducers';
import { createPlaybackWatcher } from './playback-watcher';

const send = vi.hoisted(() => vi.fn());

vi.mock('../../backend/backend', () => ({ getBackend: () => ({ send }) }));

describe('createPlaybackWatcher', () => {
  const song = { path: '/a.flac' };
  let uiState: Record<string, unknown>;
  let watch: () => void;
  const change = (changes: Record<string, unknown>) => {
    uiState = { ...uiState, ...changes };
    watch();
  };

  beforeEach(() => {
    send.mockClear();
    uiState = { nowPlaying: [], played: [], currentSong: null, currentTime: 0, shuffle: false, repeat: false, volume: 1, isPlaying: false };
    watch = createPlaybackWatcher({ getState: () => ({ uiState }) as unknown as RootState });
  });

  it('sends nothing while the playback stays as it is', () => {
    change({ isPlaying: true, currentTime: 12 });

    expect(send).not.toHaveBeenCalled();
  });

  it('sends what changed of the queue, without the position of the state', () => {
    change({ nowPlaying: [song], currentTime: 12 });

    expect(send.mock.calls).toEqual([['PLAYBACK_SNAPSHOT', { nowPlaying: [song] }]]);
  });

  it('sends the position with a new track', () => {
    change({ currentSong: song, currentTime: 0 });

    expect(send.mock.calls).toEqual([['PLAYBACK_SNAPSHOT', { currentSong: song, currentTime: 0 }]]);
  });
});
