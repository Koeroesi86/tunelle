import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import FavouriteButton from '../ui/favourite-button';
import { albumFavourite } from '../../domain/favourites';
import AddToPlaylist from './add-to-playlist';
import AlbumCoverMenu from './album-cover-menu';
import { albumCornerActions, albumCoverMenu, albumDetailsActions, serverTrackActions, trackActions } from './item-actions';

vi.mock('../ui/favourite-button', () => ({ default: () => <div>favourite</div> }));
vi.mock('./add-to-playlist', () => ({ default: () => <div>playlist</div> }));
vi.mock('./album-cover-menu', () => ({ default: () => null }));
vi.mock('./add-to-queue', () => ({
  default: ({ next, getTracks }: { next?: boolean; getTracks: () => Promise<unknown> }) => {
    queued(getTracks);
    return <div>{next ? 'play next' : 'queue'}</div>;
  },
}));

const queued = vi.hoisted(() => vi.fn<(getTracks: () => Promise<unknown>) => void>());

const track = { path: 'source://plex/1', title: 'One' } as Track;
const slot = { heartClass: 'heart', actionClass: 'action' };

const album = { id: 'al1', path: '/music/Bach', title: 'Suites', artist: 'Bach', year: '', cover: null, duration: null, trackCount: 0, tracks: [] };

describe('the buttons of an album', () => {
  const favourite = albumFavourite(album);

  it('has the favourite and the playlist on its cover', () => {
    expect(albumCornerActions(album, { favouriteClass: 'heart', playlistClass: 'list', tabIndex: -1 })).toEqual(
      <>
        <FavouriteButton item={favourite} className="heart" tabIndex={-1} />
        <AddToPlaylist source={album} className="list" tabIndex={-1} />
      </>
    );
  });

  it('has them in its details too', () => {
    expect(albumDetailsActions(album, { favouriteClass: 'heart', playlistClass: 'list' })).toEqual(
      <>
        <FavouriteButton item={favourite} className="heart" />
        <AddToPlaylist source={album} className="list" />
      </>
    );
  });

  it('has a cover menu of its own, which another album does not take over', () => {
    expect(albumCoverMenu(album)).toEqual(<AlbumCoverMenu key="al1" path="/music/Bach" title="Suites" artist="Bach" />);
  });
});

describe('the queue buttons of a row', () => {
  it.each([trackActions, serverTrackActions])('queue the track of the row', async (actions) => {
    queued.mockClear();

    render(<>{actions(track, slot)}</>);

    await expect(Promise.all(queued.mock.calls.map(([getTracks]) => getTracks()))).resolves.toEqual([[track], [track]]);
  });
});

describe('the buttons of a row of tracks', () => {
  it('has the favourite, the playlist and the queue for a track of the library', () => {
    render(<>{trackActions(track, slot)}</>);

    expect(screen.getAllByText(/favourite|playlist|queue|play next/)).toHaveLength(4);
  });

  it('has only the queue for a track of a server, as the library does not hold it', () => {
    render(<>{serverTrackActions(track, slot)}</>);

    expect(screen.getByText('queue')).toBeTruthy();
    expect(screen.getByText('play next')).toBeTruthy();
    expect(screen.queryByText('favourite')).toBeNull();
    expect(screen.queryByText('playlist')).toBeNull();
  });
});
