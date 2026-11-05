import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { AppAction } from '../../redux/types';
import Home from './index';

const play = vi.fn();

vi.mock('../favourite-button', () => ({ default: () => null }));
vi.mock('../../audio/context', () => ({
  Audio: { Consumer: ({ children }: { children: (value: { play: () => void }) => ReactNode }) => children({ play }) },
}));

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
