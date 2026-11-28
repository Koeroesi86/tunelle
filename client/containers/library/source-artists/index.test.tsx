import { describe, expect, it, vi } from 'vitest';
import type { SourceBrowse } from '@shared/schemas/sources';
import { listKey } from '../../../redux/sources/lists';
import { loadSourcePage, keepSourcePages } from '../source-list';
import View from '../../../components/library/group-view/GroupView';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { loadPage, keepPages, unanswered } = vi.hoisted(() => ({
  loadPage: vi.fn(),
  keepPages: vi.fn(),
  unanswered: { total: undefined, pages: {}, stale: [] },
}));

vi.mock('../../../components/library/group-view/GroupView', () => ({ default: vi.fn(() => null) }));
vi.mock('../source-list', () => ({ pagesAhead: 2, unanswered, loadSourcePage: vi.fn(() => loadPage), keepSourcePages: vi.fn(() => keepPages) }));

describe('the container of SourceArtists', () => {
  const request: SourceBrowse = { what: 'artists', serverId: 'server' };

  it('shows the artists of the server as a list that can not be sorted, filtered or opened in place', () => {
    renderContainer(<Container request={request} open={vi.fn()} />);

    expect(propsOf(View)).toMatchObject({
      groups: unanswered,
      kind: 'artist',
      pagesAhead: 2,
      sort: undefined,
      filter: '',
      open: undefined,
      loadPage,
      keepPages,
    });
    expect(loadSourcePage).toHaveBeenCalledWith(expect.any(Function), request);
    expect(keepSourcePages).toHaveBeenCalledWith(expect.any(Function), request);
  });

  it('shows what was fetched of its list', () => {
    const artists = { total: 0, pages: {}, stale: [] };

    renderContainer(<Container request={request} open={vi.fn()} />, (state) => ({
      ...state,
      sources: { ...state.sources, lists: { ...state.sources.lists, artists: { [listKey(request)]: artists } } },
    }));

    expect(propsOf(View).groups).toBe(artists);
  });

  it('opens an artist by its id, plays tracks and sets the size of the covers', () => {
    const open = vi.fn();
    const tracks = [aTrack({ path: '/music/a.flac' })];
    const { sent } = renderContainer(<Container request={request} open={open} />);
    const { openGroup, closeGroup, playTracks, setCoverSize } = propsOf(View);

    openGroup({ kind: 'artist', key: 'ar1', name: 'Bach' });
    closeGroup();
    playTracks(tracks);
    setCoverSize(240);

    expect(open).toHaveBeenCalledWith({ id: 'ar1', name: 'Bach' });
    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'SET_COVER_SIZE', payload: { size: 240 } },
    ]);
  });
});
