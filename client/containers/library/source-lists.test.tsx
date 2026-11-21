import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import type { SourceBrowse } from '@shared/schemas/sources';
import reducers from '../../redux/reducers';
import { pageRequest } from '../../redux/sources/lists';
import SourceAlbums from './source-albums';
import SourceArtists from './source-artists';
import SourceTracks from './source-tracks';

// the views have their own tests; they show what their container gives them
vi.mock('../../components/library/album-view/AlbumView', () => ({
  default: ({ albums, loadPage, openAlbum }: { albums: { total?: number }; loadPage: (page: number) => void; openAlbum: (album: { id: string }) => void }) => (
    <button type="button" onClick={() => openAlbum({ id: 'al1' })} onFocus={() => loadPage(0)}>
      albums {albums.total}
    </button>
  ),
}));
vi.mock('../../components/library/group-view/GroupView', () => ({
  default: ({ groups, openGroup }: { groups: { total?: number }; openGroup: (group: { key: string; name: string }) => void }) => (
    <button type="button" onClick={() => openGroup({ key: 'ar1', name: 'Bach' })}>
      groups {groups.total}
    </button>
  ),
}));
vi.mock('../../components/library/track-view/TrackView', () => ({
  default: ({
    tracks,
    sort,
    setSort,
  }: {
    tracks: { total?: number };
    sort?: { field: string };
    setSort: (sort?: { field: 'title'; direction: 'asc' }) => void;
  }) => (
    <button type="button" onClick={() => setSort({ field: 'title', direction: 'asc' })}>
      tracks {tracks.total} {sort?.field}
    </button>
  ),
}));

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const library = (kind: 'albums' | 'artists' | 'tracks', sort: 'recent' | 'title' = 'recent'): SourceBrowse => ({
  what: 'library',
  serverId,
  kind,
  sort,
  start: 0,
  size: 1,
});

const storeWith = (request: SourceBrowse, result: unknown) => {
  const store = createStore(reducers);
  store.dispatch({
    type: 'SOURCE_SERVERS_LOADED',
    payload: { servers: [{ id: serverId, kind: 'jellyfin', name: 'Home', url: 'http://home', username: 'a', protected: true }] },
  });
  const spy = vi.spyOn(store, 'dispatch');
  store.dispatch({ type: 'SOURCE_BROWSED', payload: { request: pageRequest(request, 0), result } });
  return { store, spy };
};

describe('the containers of the lists of a source', () => {
  it('give the albums that the server answered, and open one for both open and play', () => {
    const open = vi.fn();
    const request = library('albums');
    const { store } = storeWith(request, { total: 7, items: [{ id: 'al1', title: 'A', artist: 'B', year: '' }] });
    const { getByRole } = render(
      <Provider store={store}>
        <SourceAlbums request={request} open={open} />
      </Provider>
    );

    fireEvent.click(getByRole('button', { name: 'albums 7' }));
    expect(open).toHaveBeenCalledWith({ id: 'al1' });
  });

  it('asks for a page of the list it shows', () => {
    const request = library('albums');
    const { store, spy } = storeWith(request, undefined);
    spy.mockClear();
    const { getByRole } = render(
      <Provider store={store}>
        <SourceAlbums request={request} open={vi.fn()} />
      </Provider>
    );

    fireEvent.focus(getByRole('button'));
    expect(spy).toHaveBeenCalledWith({ type: 'BROWSE_SOURCE', payload: { request: pageRequest(request, 0) } });
  });

  it('give the artists, opening one with its id and name', () => {
    const open = vi.fn();
    const request = library('artists');
    const { store } = storeWith(request, { total: 3, items: [{ id: 'ar1', name: 'Bach' }] });
    const { getByRole } = render(
      <Provider store={store}>
        <SourceArtists request={request} open={open} />
      </Provider>
    );

    fireEvent.click(getByRole('button', { name: 'groups 3' }));
    expect(open).toHaveBeenCalledWith({ id: 'ar1', name: 'Bach' });
  });

  it('give the tracks, sorted by title when the request is, and set the order from the header', () => {
    const setTitleOrder = vi.fn();
    const request = library('tracks', 'title');
    const { store } = storeWith(request, { total: 2, items: [] });
    const { getByRole } = render(
      <Provider store={store}>
        <SourceTracks request={request} setTitleOrder={setTitleOrder} />
      </Provider>
    );

    fireEvent.click(getByRole('button', { name: /^tracks \d* ?title$/ }));
    expect(setTitleOrder).toHaveBeenCalledWith(true);
  });
});
