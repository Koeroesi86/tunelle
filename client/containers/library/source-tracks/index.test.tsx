import { describe, expect, it, vi } from 'vitest';
import type { SourceBrowse } from '@shared/schemas/sources';
import { listKey } from '../../../redux/sources/lists';
import { loadSourcePage, keepSourcePages } from '../source-list';
import View from '../../../components/library/track-view/TrackView';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { loadPage, keepPages, unanswered } = vi.hoisted(() => ({
  loadPage: vi.fn(),
  keepPages: vi.fn(),
  unanswered: { total: undefined, pages: {}, stale: [] },
}));
const serverTrackActions = vi.hoisted(() => vi.fn());

vi.mock('../../../components/library/track-view/TrackView', () => ({ default: vi.fn(() => null) }));
vi.mock('../source-list', () => ({ pagesAhead: 2, unanswered, loadSourcePage: vi.fn(() => loadPage), keepSourcePages: vi.fn(() => keepPages) }));
vi.mock('../item-actions', () => ({ serverTrackActions }));

describe('the container of SourceTracks', () => {
  const search: SourceBrowse = { what: 'search', serverId: 'server', query: 'bach' };
  const library = (sort: 'title' | 'recent'): SourceBrowse => ({ what: 'library', serverId: 'server', kind: 'tracks', sort, start: 0, size: 50 });
  const tracks = [aTrack({ path: '/music/a.flac' }), aTrack({ path: '/music/b.flac' })];

  it.each([
    { name: 'a search', request: search, query: 'bach', sort: undefined },
    { name: 'a library by title', request: library('title'), query: undefined, sort: { field: 'title', direction: 'asc' } },
    { name: 'a library by date', request: library('recent'), query: undefined, sort: undefined },
  ])('shows the tracks of $name with their search and order', ({ request, query, sort }) => {
    renderContainer(<Container request={request} />);

    expect(propsOf(View)).toMatchObject({ tracks: unanswered, search: query, pagesAhead: 2, renderActions: serverTrackActions, loadPage, keepPages });
    expect(propsOf(View).sort).toEqual(sort);
    expect(loadSourcePage).toHaveBeenCalledWith(expect.any(Function), request);
    expect(keepSourcePages).toHaveBeenCalledWith(expect.any(Function), request);
  });

  it('gives all the fetched tracks of its list', async () => {
    const cache = { total: 2, pages: { 0: [tracks[0]], 1: [tracks[1]] }, stale: [] };

    renderContainer(<Container request={search} />, (state) => ({
      ...state,
      sources: { ...state.sources, lists: { ...state.sources.lists, tracks: { [listKey(search)]: cache } } },
    }));

    expect(propsOf(View).tracks).toBe(cache);
    await expect(propsOf(View).fetchAll({ search: '', folders: [], sort: undefined })).resolves.toEqual(tracks);
  });

  it.each([
    { field: 'title' as const, title: true },
    { field: undefined, title: false },
  ])('tells the library whether to order by title: $title', ({ field, title }) => {
    const setTitleOrder = vi.fn();
    renderContainer(<Container request={search} setTitleOrder={setTitleOrder} />);

    propsOf(View).setSort(field && { field, direction: 'asc' });

    expect(setTitleOrder).toHaveBeenCalledWith(title);
  });

  it('takes a change of the order that nothing listens to', () => {
    renderContainer(<Container request={search} />);

    expect(() => propsOf(View).setSort(undefined)).not.toThrow();
  });

  it('plays and selects tracks', () => {
    const { sent } = renderContainer(<Container request={search} />);
    const { playTracks, toggleTrack, selectTracks, clearSelection } = propsOf(View);

    playTracks(tracks);
    toggleTrack(tracks[0]);
    selectTracks(tracks);
    clearSelection();

    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'TOGGLE_TRACK_SELECTION', payload: { track: tracks[0] } },
      { type: 'SELECT_TRACKS', payload: { tracks } },
      { type: 'CLEAR_TRACK_SELECTION', payload: {} },
    ]);
  });
});
