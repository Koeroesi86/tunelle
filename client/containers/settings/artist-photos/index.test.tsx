import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/artist-photos/ArtistPhotos';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/artist-photos/ArtistPhotos', () => ({ default: vi.fn(() => null) }));

describe('the container of ArtistPhotos', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, artistPhotos: true } }));
    const { enabled, setEnabled } = propsOf(View);

    setEnabled(false);

    expect(enabled).toEqual(true);
    expect(sent()).toEqual([{ type: 'SET_ARTIST_PHOTOS', payload: { enabled: false } }]);
  });
});
