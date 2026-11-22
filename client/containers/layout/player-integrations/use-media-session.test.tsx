import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMediaSession, useMediaSessionActions } from './use-media-session';

class FakeMediaMetadata {
  title: string;
  artwork: { src: string }[];

  constructor(init: { title: string; artwork?: { src: string }[] }) {
    this.title = init.title;
    this.artwork = init.artwork ?? [];
  }
}

const info = { title: 'Song', artist: 'Artist', album: 'Album', cover: 'tunelle://app/albumart/cover.png' };

describe('useMediaSession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'mediaSession', { value: { metadata: null, setActionHandler: vi.fn() }, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:cover');
    URL.revokeObjectURL = vi.fn();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(new Blob(['png']), { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives the cover as a blob, as the artwork can not be an address of the protocol', async () => {
    renderHook(() => useMediaSession(info));

    await waitFor(() => expect((navigator.mediaSession.metadata as unknown as FakeMediaMetadata).artwork).toEqual([{ src: 'blob:cover' }]));
    expect(fetchMock).toHaveBeenCalledWith(info.cover, expect.anything());
  });

  it('shows the track without a cover when the cover is not found', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    renderHook(() => useMediaSession(info));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((navigator.mediaSession.metadata as unknown as FakeMediaMetadata).title).toBe('Song');
    expect((navigator.mediaSession.metadata as unknown as FakeMediaMetadata).artwork).toEqual([]);
  });

  it('releases the blob when the track changes', async () => {
    const { rerender } = renderHook(({ value }) => useMediaSession(value), { initialProps: { value: info } });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    rerender({ value: { ...info, title: 'Next' } });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover');
  });

  it('clears the metadata without a track', () => {
    const { rerender } = renderHook(({ value }) => useMediaSession(value), { initialProps: { value: info as typeof info | undefined } });

    rerender({ value: undefined });

    expect(navigator.mediaSession.metadata).toBeNull();
  });

  describe('useMediaSessionActions', () => {
    const actions = () => ({ play: vi.fn(), pause: vi.fn(), previousSong: vi.fn(), nextSong: vi.fn() });
    const handlerOf = (action: string) => vi.mocked(navigator.mediaSession.setActionHandler).mock.calls.find(([name]) => name === action)?.[1];

    it('lets the media keys call the player', () => {
      const given = actions();
      renderHook(() => useMediaSessionActions(given));

      handlerOf('play')?.({ action: 'play' });
      handlerOf('pause')?.({ action: 'pause' });
      handlerOf('previoustrack')?.({ action: 'previoustrack' });
      handlerOf('nexttrack')?.({ action: 'nexttrack' });

      expect([given.play, given.pause, given.previousSong, given.nextSong].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    });

    it('takes the handlers away when the player goes', () => {
      const { unmount } = renderHook(() => useMediaSessionActions(actions()));

      unmount();

      expect(navigator.mediaSession.setActionHandler).toHaveBeenLastCalledWith('nexttrack', null);
    });
  });
});
