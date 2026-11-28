import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import Favourites from './index';
import View from '../../../components/pages/favourites/FavouritesView';
import { propsOf, renderContainer } from '../../../test/render-container';
import { getFavouriteTracks } from '../../../services/favourite-tracks';
import { renderFavourite } from '../../ui/render-favourite';
import { aTrack } from '../../../test/a-track';

vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../../library/add-to-queue', () => ({ default: () => null }));

vi.mock('../../../components/pages/favourites/FavouritesView', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../components/pages/favourites/FavouritesView')>();
  return { default: vi.fn(original.default) };
});

describe('Favourites', () => {
  it('opens as it was left: the side and the order stay when the view is mounted again', () => {
    const store = createStore(reducers);
    const view = () => (
      <Provider store={store}>
        <Favourites />
      </Provider>
    );
    render(view());

    fireEvent.click(screen.getByRole('button', { name: /Online/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'name' } });
    cleanup();
    render(view());

    expect(screen.getByRole('button', { name: /Online/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement).value).toBe('name');
  });
});

describe('the container of Favourites', () => {
  it('gives the view how the tracks of a favourite are fetched, and its heart', () => {
    renderContainer(<Favourites />);

    expect(propsOf(View)).toMatchObject({ getFavouriteTracks, renderFavourite });
  });

  it('plays and queues what is liked', () => {
    const tracks = [aTrack()];
    const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
    const { sent } = renderContainer(<Favourites />);
    const { playTracks, addToQueue, playStation } = propsOf(View);

    playTracks(tracks);
    addToQueue(tracks, false);
    addToQueue(tracks, true);
    playStation(station);

    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'ADD_TO_QUEUE', payload: { tracks } },
      { type: 'PLAY_NEXT', payload: { tracks } },
      { type: 'PLAY_RADIO_STATION', payload: { station } },
    ]);
  });
});
