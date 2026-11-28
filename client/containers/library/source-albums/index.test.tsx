import { describe, expect, it, vi } from 'vitest';
import type { SourceBrowse } from '@shared/schemas/sources';
import { listKey } from '../../../redux/sources/lists';
import { loadSourcePage, keepSourcePages } from '../source-list';
import View from '../../../components/library/album-view/AlbumView';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { loadPage, keepPages, unanswered } = vi.hoisted(() => ({
  loadPage: vi.fn(),
  keepPages: vi.fn(),
  unanswered: { total: undefined, pages: {}, stale: [] },
}));

vi.mock('../../../components/library/album-view/AlbumView', () => ({ default: vi.fn(() => null) }));
vi.mock('../source-list', () => ({ pagesAhead: 2, unanswered, loadSourcePage: vi.fn(() => loadPage), keepSourcePages: vi.fn(() => keepPages) }));

describe('the container of SourceAlbums', () => {
  const search: SourceBrowse = { what: 'search', serverId: 'server', query: 'bach' };
  const artist: SourceBrowse = { what: 'albums', serverId: 'server', id: 'ar1' };

  it.each([
    { request: search, query: 'bach' },
    { request: artist, query: undefined },
  ])('shows the list of a $request.what request, which marks the text "$query"', ({ request, query }) => {
    const open = vi.fn();

    renderContainer(<Container request={request} open={open} toolbar="tools" />);

    expect(propsOf(View)).toMatchObject({
      albums: unanswered,
      search: query,
      sort: undefined,
      toolbar: 'tools',
      pagesAhead: 2,
      openAlbum: open,
      playAlbum: open,
    });
    expect(propsOf(View)).toMatchObject({ loadPage, keepPages });
  });

  it('shows what was fetched of its list, loads for its request and sets the size of the covers', () => {
    const albums = { total: 0, pages: {}, stale: [] };
    const { sent } = renderContainer(<Container request={artist} open={vi.fn()} />, (state) => ({
      ...state,
      sources: { ...state.sources, lists: { ...state.sources.lists, albums: { [listKey(artist)]: albums } } },
    }));

    propsOf(View).setCoverSize(240);

    expect(propsOf(View).albums).toBe(albums);
    expect(loadSourcePage).toHaveBeenCalledWith(expect.any(Function), artist);
    expect(keepSourcePages).toHaveBeenCalledWith(expect.any(Function), artist);
    expect(sent()).toEqual([{ type: 'SET_COVER_SIZE', payload: { size: 240 } }]);
  });
});
