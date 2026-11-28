import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { RadioStation } from '@shared/types/radio';
import reducers from '../../../redux/reducers';
import { stationFavourite } from '../../../domain/favourites';
import ConnectedFavouriteButton from './index';

const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const item = stationFavourite(station);

describe('the connected FavouriteButton', () => {
  it('shows the same state in every heart of an item, from the store', () => {
    const store = createStore(reducers);
    render(
      <Provider store={store}>
        <ConnectedFavouriteButton item={item} />
        <ConnectedFavouriteButton item={item} />
      </Provider>
    );
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
    expect(store.getState().favourites).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2);
    expect(store.getState().favourites).toHaveLength(0);
  });
});
