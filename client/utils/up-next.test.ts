import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../types/library';
import { resolveUpNext } from './up-next';

const track = (path: string): Track => ({ path, artist: '', album: '', title: '', year: '', track: '', disk: '', genre: '', picture: null, duration: null });
const [a, b, c] = ['a', 'b', 'c'].map(track);
const state = (overrides: Partial<Parameters<typeof resolveUpNext>[0]> = {}) => ({
  nowPlaying: [a, b, c],
  currentSong: a,
  repeat: false,
  shuffle: false,
  played: [],
  upNext: null,
  ...overrides,
});

describe('resolveUpNext', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the queue', () => {
    expect(resolveUpNext(state({ currentSong: b }))).toEqual(c);
  });

  it('ends at the last track', () => {
    expect(resolveUpNext(state({ currentSong: c }))).toBeUndefined();
  });

  it('wraps to the first track with repeat', () => {
    expect(resolveUpNext(state({ currentSong: c, repeat: true }))).toEqual(a);
  });

  it('repeats a queue of one track', () => {
    expect(resolveUpNext(state({ nowPlaying: [a], repeat: true }))).toEqual(a);
  });

  it('starts with the first track when the current one is not in the queue', () => {
    expect(resolveUpNext(state({ currentSong: track('x') }))).toEqual(a);
  });

  describe('with shuffle', () => {
    it('does not pick the current track or one that was played', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(resolveUpNext(state({ shuffle: true, currentSong: b, played: [a] }))).toEqual(c);
    });

    it('keeps the track that was chosen while it is a valid pick', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(resolveUpNext(state({ shuffle: true, upNext: c }))).toEqual(c);
    });

    it('chooses again when the track that was chosen is the current one now', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(resolveUpNext(state({ shuffle: true, currentSong: b, upNext: b }))).toEqual(a);
    });

    it('ends when every track was played', () => {
      expect(resolveUpNext(state({ shuffle: true, currentSong: c, played: [a, b] }))).toBeUndefined();
    });

    it('starts over with repeat, whatever was played', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(resolveUpNext(state({ shuffle: true, repeat: true, currentSong: c, played: [a, b] }))).toEqual(a);
    });

    it('repeats a queue of one track', () => {
      expect(resolveUpNext(state({ shuffle: true, repeat: true, nowPlaying: [a] }))).toEqual(a);
    });
  });
});
