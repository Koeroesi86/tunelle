import { describe, expect, it, vi } from 'vitest';
import { fetchGroupCover } from '../../../services/library-api';
import View from '../../../components/library/artist-photo/ArtistPhoto';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/artist-photo/ArtistPhoto', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../services/library-api', () => ({ fetchGroupCover: vi.fn() }));

describe('the container of ArtistPhoto', () => {
  it('gives the photo the revision, which changes as a photo does, and how its cover is fetched', () => {
    renderContainer(<Container kind="artist" photoKey="bach" />, (state) => ({ ...state, uiState: { ...state.uiState, artistPhotoRevision: 4 } }));

    expect(propsOf(View)).toMatchObject({ revision: 4, fetchCover: fetchGroupCover });
  });
});
