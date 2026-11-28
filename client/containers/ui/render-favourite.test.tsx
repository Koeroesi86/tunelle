import { describe, expect, it, vi } from 'vitest';
import { stationFavourite } from '../../domain/favourites';
import FavouriteButton from './favourite-button';
import { renderFavourite } from './render-favourite';

vi.mock('./favourite-button', () => ({ default: () => null }));

describe('renderFavourite', () => {
  it('gives the heart of the store for an item', () => {
    const item = stationFavourite({ uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 });

    expect(renderFavourite(item, 'heart')).toEqual(<FavouriteButton item={item} className="heart" />);
  });
});
