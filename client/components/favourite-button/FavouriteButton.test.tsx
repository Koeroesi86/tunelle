import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { RadioStation } from '@shared/types/radio';
import reducers from '../../redux/reducers';
import { stationFavourite } from '../../domain/favourites';
import FavouriteButton from './FavouriteButton';
import ConnectedFavouriteButton from './index';

const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };
const item = stationFavourite(station);

describe('FavouriteButton', () => {
  it('adds the item when it is not a favourite and removes its key when it is', () => {
    const add = vi.fn();
    const remove = vi.fn();
    const { rerender } = render(<FavouriteButton item={item} active={false} add={add} remove={remove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to favourites' }));
    rerender(<FavouriteButton item={item} active add={add} remove={remove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from favourites' }));

    expect(add).toHaveBeenCalledWith(item);
    expect(remove).toHaveBeenCalledWith(item);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('does not click the row it sits in', () => {
    const onClick = vi.fn();
    render(
      <div onClick={onClick} onDoubleClick={onClick}>
        <FavouriteButton item={item} active={false} add={vi.fn()} remove={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.doubleClick(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

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
  });
});
