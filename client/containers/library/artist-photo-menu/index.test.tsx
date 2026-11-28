import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/artist-photo-menu/ArtistPhotoMenu';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/artist-photo-menu/ArtistPhotoMenu', () => ({ default: vi.fn(() => null) }));

describe('the container of ArtistPhotoMenu', () => {
  it('offers a search when photos of artists may be asked for', () => {
    renderContainer(<Container photoKey="bach" name="Bach" />, (state) => ({ ...state, uiState: { ...state.uiState, artistPhotos: true } }));

    expect(propsOf(View)).toMatchObject({ searchAllowed: true, failure: undefined, candidates: undefined });
  });

  it('sends the changes of the photo of its artist', () => {
    const { sent } = renderContainer(<Container photoKey="bach" name="Bach" />);
    const { change, search, download } = propsOf(View);

    change('remove');
    search('Johann');
    download('https://photos.example/1');

    expect(sent()).toEqual([
      { type: 'CHANGE_ARTIST_PHOTO', payload: { key: 'bach', change: 'remove' } },
      { type: 'SEARCH_ARTIST_PHOTOS', payload: { query: 'Johann' } },
      { type: 'CHANGE_ARTIST_PHOTO', payload: { key: 'bach', change: 'download', picture: 'https://photos.example/1' } },
    ]);
  });
});
