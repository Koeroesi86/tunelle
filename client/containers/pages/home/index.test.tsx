import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { AppAction } from '../../../redux/types';
import Home from './index';
import View from '../../../components/pages/home/HomeView';
import { propsOf, renderContainer } from '../../../test/render-container';
import { getFavouriteTracks } from '../../../services/favourite-tracks';
import { renderFavourite } from '../../ui/render-favourite';
import { aTrack } from '../../../test/a-track';

const play = vi.fn();

vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../../../audio/context', () => ({
  Audio: { Consumer: ({ children }: { children: (value: { play: () => void }) => ReactNode }) => children({ play }) },
}));

vi.mock('../../../components/pages/home/HomeView', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../components/pages/home/HomeView')>();
  return { default: vi.fn(original.default) };
});

describe('Home', () => {
  it('plays the paused track and opens the page of what plays when resuming', () => {
    const actions: AppAction[] = [];
    const state = {
      history: [],
      favourites: [],
      playlists: [],
      folders: [],
      uiState: {
        currentSong: {
          path: '/music/a.flac',
          artist: 'Artist',
          album: 'Record',
          title: 'One',
          year: 2020,
          track: 1,
          disk: 1,
          genre: '',
          picture: null,
          duration: 100,
        },
        isPlaying: false,
        currentTime: 30,
      },
    };
    const store = createStore((current: typeof state = state, action: AppAction) => {
      actions.push(action);
      return current;
    });

    render(
      <Provider store={store}>
        <Home />
      </Provider>
    );
    fireEvent.click(screen.getByText('Resume'));

    expect(play).toHaveBeenCalledTimes(1);
    expect(actions).toContainEqual({ type: 'SET_TAB', payload: { tab: 'now-playing' } });
  });
});

describe('the container of Home', () => {
  it('knows whether the library has folders', () => {
    renderContainer(<Home />, (state) => ({ ...state, folders: [{ path: '/music', lastModified: 1 }] }));

    expect(propsOf(View)).toMatchObject({ hasFolders: true, getFavouriteTracks, renderFavourite });
  });

  it('plays, clears the history, and opens the folders of the library to add one', () => {
    const tracks = [aTrack()];
    const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
    const { sent } = renderContainer(<Home />);
    const { playTracks, playStation, clearHistory, addFolder } = propsOf(View);

    playTracks(tracks);
    playStation(station);
    clearHistory();
    addFolder?.();

    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'PLAY_RADIO_STATION', payload: { station } },
      { type: 'CLEAR_HISTORY' },
      { type: 'SET_VIEW', payload: { view: 'folders' } },
      { type: 'SET_TAB', payload: { tab: 'local' } },
    ]);
  });
});
