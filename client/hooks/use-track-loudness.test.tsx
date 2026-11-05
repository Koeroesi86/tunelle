import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../domain/radio-track';
import { useTrackLoudness } from './use-track-loudness';

const track = (path: string, extra: Partial<Track> = {}): Track => ({
  path,
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: null,
  ...extra,
});

const station = toRadioTrack({ uuid: 'abc-1', name: 'Jazz FM', country: 'UK', tags: ['jazz'], codec: 'MP3', bitrate: 128 });

const loudness = (trackGain: number | null) => ({ codec: 'FLAC', trackGain, albumGain: null, trackPeak: 0.5, albumPeak: null });

const answers = (byPath: Record<string, unknown>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const found = byPath[decodeURIComponent(url.split('path=')[1])];
      return Promise.resolve({ ok: found !== undefined, status: found ? 200 : 404, json: () => Promise.resolve(found) });
    })
  );

describe('useTrackLoudness', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives a track the loudness the library has of it, and the track as it is until then', async () => {
    answers({ '/m/a.flac': loudness(-6) });
    const a = track('/m/a.flac');
    const { result } = renderHook(() => useTrackLoudness([a, null]));

    expect(result.current(a)).toEqual(a);
    await waitFor(() => expect(result.current(a)?.trackGain).toBe(-6));
    expect(result.current(a)).toEqual({ ...a, trackGain: -6, albumGain: null, trackPeak: 0.5, albumPeak: null });
    expect(result.current(undefined)).toBeUndefined();
  });

  it('keeps the track as it was given for a track the library does not have, and asks nothing for a station', async () => {
    answers({});
    const gone = track('/m/gone.flac', { trackGain: -2 });
    const { result } = renderHook(() => useTrackLoudness([gone, station]));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(result.current(gone)).toEqual(gone);
    expect(result.current(station)).toEqual(station);
  });

  it('keeps what is known of the track that stays when the next one changes, while it is read again', async () => {
    answers({ '/m/a.flac': loudness(-6), '/m/b.flac': loudness(-3), '/m/c.flac': loudness(-1) });
    const [a, b, c] = ['a', 'b', 'c'].map((name) => track(`/m/${name}.flac`));
    const { result, rerender } = renderHook(({ tracks }) => useTrackLoudness(tracks), { initialProps: { tracks: [a, b] } });
    await waitFor(() => expect(result.current(b)?.trackGain).toBe(-3));

    act(() => rerender({ tracks: [b, c] }));

    expect(result.current(b)?.trackGain).toBe(-3);
    await waitFor(() => expect(result.current(c)?.trackGain).toBe(-1));
    expect(result.current(a)?.trackGain).toBeUndefined();
  });
});
