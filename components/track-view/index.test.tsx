import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { Track } from '../../types/library';
import reducers from '../../client/redux/reducers';
import { pageSize } from '../../client/redux/library/pages';
import TrackView from './index';

vi.mock('../favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-playlist', () => ({ default: () => null }));
vi.mock('../add-to-queue', () => ({ default: () => null }));

const track = (index: number): Track => ({
  path: `/music/${index}.flac`,
  artist: 'Artist',
  album: 'Album',
  title: `Title ${index}`,
  year: 2020,
  track: index,
  disk: 1,
  genre: '',
  picture: null,
  duration: 60,
});

const setup = () => {
  const store = createStore(reducers);
  store.dispatch({ type: 'STORE_TRACK_PAGE', payload: { page: 0, items: Array.from({ length: pageSize }, (_, index) => track(index)), total: 50 } });
  const view = () => (
    <Provider store={store}>
      <TrackView />
    </Provider>
  );
  return { store, view };
};

describe('TrackView', () => {
  it('keeps the selection when the page is left and opened again', () => {
    const { view } = setup();
    render(view());

    fireEvent.click(screen.getByText('Title 2'));
    cleanup();
    render(view());

    expect(screen.getByText('Title 2').closest('.trackViewItem')?.classList.contains('selected')).toBe(true);
    expect((screen.getByText('Play selected') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clears the selection with the button, and unselects a track that is clicked again', () => {
    const { store, view } = setup();
    render(view());

    fireEvent.click(screen.getByText('Title 2'));
    fireEvent.click(screen.getByText('Title 3'));
    fireEvent.click(screen.getByText('Title 2'));
    expect(Object.keys(store.getState().uiState.selectedTracks)).toEqual(['/music/3.flac']);

    fireEvent.click(screen.getByText('Clear selection'));
    expect(store.getState().uiState.selectedTracks).toEqual({});
  });
});
