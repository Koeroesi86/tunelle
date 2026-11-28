import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/album-cover-menu/AlbumCoverMenu';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/album-cover-menu/AlbumCoverMenu', () => ({ default: vi.fn(() => null) }));

describe('the container of AlbumCoverMenu', () => {
  const album = { path: '/music/Bach', title: 'Suites' };

  it.each([
    { artist: 'Bach', title: 'Suites', initialQuery: 'Bach Suites' },
    { artist: '', title: 'Suites', initialQuery: 'Suites' },
  ])('starts a search with "$initialQuery"', ({ artist, title, initialQuery }) => {
    renderContainer(<Container path={album.path} title={title} artist={artist} />);

    expect(propsOf(View)).toMatchObject({ initialQuery, failure: undefined, candidates: undefined });
  });

  it('sends the changes of the cover of its album', () => {
    const { sent } = renderContainer(<Container {...album} artist="Bach" />);
    const { change, search, download } = propsOf(View);

    change('reset');
    search('cello');
    download('https://covers.example/1');

    expect(sent()).toEqual([
      { type: 'CHANGE_ALBUM_COVER', payload: { ...album, change: 'reset' } },
      { type: 'SEARCH_ALBUM_COVERS', payload: { query: 'cello' } },
      { type: 'CHANGE_ALBUM_COVER', payload: { ...album, change: 'download', picture: 'https://covers.example/1' } },
    ]);
  });
});
