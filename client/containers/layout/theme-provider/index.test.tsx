import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { toRadioTrack } from '../../../domain/radio-track';
import type { Track } from '@shared/types/library';
import { getBackend, setBackend } from '../../../backend/backend';
import ThemeProvider from './index';

const coverAccent = vi.hoisted(() => vi.fn());

vi.mock('../../../services/cover-accent', () => ({ coverAccent }));

const track: Track = {
  path: '/music/song.flac',
  artist: 'Artist',
  album: 'Album',
  title: 'Song',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: '/art/abc.jpg',
  duration: 1,
};
const station = toRadioTrack({ uuid: 'station-1', name: 'Station', country: '', tags: [], codec: 'MP3', bitrate: 128 });

const setup = (actions: AppAction[]) => {
  const store = createStore(reducers);
  [{ type: 'SET_ACCENT', payload: { accent: 'auto' } } as const, ...actions].forEach((action) => store.dispatch(action));
  render(
    <Provider store={store}>
      <ThemeProvider>content</ThemeProvider>
    </Provider>
  );
};

const original = getBackend();

describe('ThemeProvider connected to the store', () => {
  beforeEach(() => {
    coverAccent.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-reduce-motion');
    setBackend(original);
  });

  it('reads the cover of the local track that plays', async () => {
    setup([{ type: 'PLAY_TRACK', payload: { track } }]);

    await waitFor(() => expect(coverAccent).toHaveBeenCalledExactlyOnceWith('tunelle://app/albumart/abc-optimized.png'));
  });

  it('reads the art of the song a station has on air', async () => {
    setup([
      { type: 'PLAY_TRACK', payload: { track: station } },
      { type: 'RADIO_STREAM_TITLE', payload: { uuid: 'station-1', title: 'Artist - Song' } },
      { type: 'RADIO_STREAM_ART', payload: { uuid: 'station-1', title: 'Artist - Song', art: 'art-1.png' } },
    ]);

    await waitFor(() => expect(coverAccent).toHaveBeenCalledExactlyOnceWith('tunelle://app/radio-art/art-1.png'));
  });

  it('stops the motion of a window that has no GPU, whatever the setting is', () => {
    setBackend({ ...original, capabilities: { blur: false, mpris: false, software: true } });
    setup([]);

    expect(document.documentElement.hasAttribute('data-reduce-motion')).toBe(true);
  });

  it('leaves the motion of a window with a GPU to the setting', () => {
    setup([]);

    expect(document.documentElement.hasAttribute('data-reduce-motion')).toBe(false);
  });

  it('reads nothing without a track or a cover', () => {
    setup([]);
    expect(coverAccent).not.toHaveBeenCalled();

    cleanup();
    setup([{ type: 'PLAY_TRACK', payload: { track: { ...track, picture: null } } }]);
    expect(coverAccent).not.toHaveBeenCalled();
  });
});
