import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { Track } from '@shared/types/library';
import reducers from '../../../redux/reducers';
import TrackView from './index';
import View from '../../../components/library/track-view/TrackView';
import { propsOf, renderContainer } from '../../../test/render-container';
import { fetchLibrary } from '../../../services/library-api';
import { trackActions } from '../item-actions';
import { pageSize } from '../../../constants/library';

vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-playlist', () => ({ default: () => null }));
vi.mock('../add-to-queue', () => ({ default: () => null }));
vi.mock('../../../components/library/track-view/TrackView', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../components/library/track-view/TrackView')>();
  return { default: vi.fn(original.default) };
});

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

describe('the container of TrackView', () => {
  it('gives the view how the whole library is fetched and the buttons of a row', () => {
    renderContainer(<TrackView />);

    expect(propsOf(View)).toMatchObject({ fetchAll: fetchLibrary, renderActions: trackActions });
  });

  it('plays, sorts, selects and asks for pages', () => {
    const tracks = [track(1)];
    const { sent } = renderContainer(<TrackView />);
    const { playTracks, loadPage, setSort, toggleTrack, selectTracks, clearSelection } = propsOf(View);

    playTracks(tracks);
    loadPage(2);
    setSort(undefined);
    toggleTrack(tracks[0]);
    selectTracks(tracks);
    clearSelection();

    expect(sent()).toEqual(
      expect.arrayContaining([
        { type: 'PLAY_TRACKS', payload: { tracks } },
        { type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'tracks', page: 2 } },
        { type: 'SET_TRACK_SORT', payload: { sort: undefined } },
        { type: 'TOGGLE_TRACK_SELECTION', payload: { track: tracks[0] } },
        { type: 'SELECT_TRACKS', payload: { tracks } },
        { type: 'CLEAR_TRACK_SELECTION', payload: {} },
      ])
    );
  });
});
