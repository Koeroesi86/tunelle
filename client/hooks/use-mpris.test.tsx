import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMpris, useMprisCommands } from './use-mpris';

const send = vi.fn();
const on = vi.fn();
const info = { title: 'Song', artist: 'Artist', album: 'Album', cover: 'tunelle://app/albumart/cover.png', duration: 200 };
const track = { title: 'Song', artist: 'Artist', album: 'Album', duration: 200, coverUrl: undefined };

const enable = (mpris: boolean) => {
  window.electronAPI = { send, on, getPathForFile: () => '', blurred: false, mpris };
};

describe('useMpris', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    enable(true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response('png', { status: 200, headers: { 'content-type': 'image/png' } }));
  });

  afterEach(() => vi.useRealTimers());

  it('sends nothing where the page does not own the media controls', () => {
    enable(false);
    renderHook(() => useMpris(info, { isPlaying: true, currentTime: 0 }));

    expect(send).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the track and whether it plays', () => {
    const { rerender } = renderHook(({ isPlaying }) => useMpris(info, { isPlaying, currentTime: 12 }), { initialProps: { isPlaying: true } });

    expect(send).toHaveBeenCalledWith('MPRIS_STATE', { track, playing: true, position: 12, seeked: false });

    rerender({ isPlaying: false });

    expect(send).toHaveBeenLastCalledWith('MPRIS_STATE', { track, playing: false, position: 12, seeked: false });
  });

  it('sends no track when nothing plays', () => {
    renderHook(() => useMpris(undefined, { isPlaying: false, currentTime: 0 }));

    expect(send).toHaveBeenCalledWith('MPRIS_STATE', { track: undefined, playing: false, position: 0, seeked: false });
  });

  it('sends the cover as bytes, after clearing the one of the track before', async () => {
    renderHook(() => useMpris(info, { isPlaying: true, currentTime: 0 }));

    expect(send).toHaveBeenCalledWith('MPRIS_COVER', undefined);
    await waitFor(() => expect(send).toHaveBeenCalledWith('MPRIS_COVER', { bytes: expect.any(Uint8Array), type: 'image/png' }));
    expect(fetchMock).toHaveBeenCalledWith(info.cover, expect.anything());
  });

  it('sends no cover when it is not found', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    renderHook(() => useMpris(info, { isPlaying: true, currentTime: 0 }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(send).not.toHaveBeenCalledWith('MPRIS_COVER', expect.objectContaining({ bytes: expect.anything() }));
  });

  it('takes the playback on as no seek and a jump as a seek', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    const { rerender } = renderHook(({ currentTime }) => useMpris(info, { isPlaying: true, currentTime }), { initialProps: { currentTime: 10 } });
    send.mockClear();

    vi.setSystemTime(1000);
    rerender({ currentTime: 11 });
    expect(send).not.toHaveBeenCalled();

    vi.setSystemTime(2000);
    rerender({ currentTime: 90 });
    expect(send).toHaveBeenCalledWith('MPRIS_STATE', { track, playing: true, position: 90, seeked: true });
  });
});

describe('useMprisCommands', () => {
  const commands = () => ({ play: vi.fn(), pause: vi.fn(), isPlaying: true, previousSong: vi.fn(), nextSong: vi.fn(), setCurrentTime: vi.fn() });
  const listener = () => on.mock.calls[0][1] as (command: unknown) => void;

  beforeEach(() => enable(true));

  it('does not listen where the page does not own the media controls', () => {
    enable(false);
    renderHook(() => useMprisCommands(commands()));

    expect(on).not.toHaveBeenCalled();
  });

  it('listens once, however often the page renders', () => {
    const { rerender } = renderHook(() => useMprisCommands(commands()));
    rerender();

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('MPRIS_COMMAND', expect.any(Function));
  });

  it('drives the player with what it has now', () => {
    const first = commands();
    const second = { ...commands(), isPlaying: false };
    const { rerender } = renderHook((props) => useMprisCommands(props), { initialProps: first });
    rerender(second);

    listener()({ name: 'next' });
    listener()({ name: 'previous' });
    listener()({ name: 'playPause' });
    listener()({ name: 'stop' });
    listener()({ name: 'seekTo', position: 42 });

    expect(second.nextSong).toHaveBeenCalled();
    expect(second.previousSong).toHaveBeenCalled();
    expect(second.play).toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalledTimes(1);
    expect(second.setCurrentTime).toHaveBeenCalledWith(42);
    expect(first.nextSong).not.toHaveBeenCalled();
  });

  it('pauses on playPause while it plays', () => {
    const player = commands();
    renderHook(() => useMprisCommands(player));

    listener()({ name: 'playPause' });

    expect(player.pause).toHaveBeenCalled();
  });
});
