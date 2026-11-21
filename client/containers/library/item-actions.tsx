import type { ReactNode } from 'react';
import type { Album, AlbumSummary, Track } from '@shared/types/library';
import { albumFavourite, trackFavourite } from '../../domain/favourites';
import type { AlbumDetailsActionSlot } from '../../components/library/album-details/AlbumDetails';
import type { AlbumActionSlot } from '../../components/library/album-view-thumbnail/AlbumViewThumbnail';
import type { TrackActionSlot } from '../../components/library/track-view-item/TrackViewItem';
import FavouriteButton from '../ui/favourite-button';
import AddToPlaylist from './add-to-playlist';
import AddToQueue from './add-to-queue';
import AlbumCoverMenu from './album-cover-menu';

/** The buttons the library views take as slots: they are module functions, so the rows that are memoized do not render again for them */
export const albumCornerActions = (album: AlbumSummary, { favouriteClass, playlistClass, tabIndex }: AlbumActionSlot): ReactNode => (
  <>
    <FavouriteButton item={albumFavourite(album)} className={favouriteClass} tabIndex={tabIndex} />
    <AddToPlaylist source={album} className={playlistClass} tabIndex={tabIndex} />
  </>
);

export const trackActions = (track: Track, { heartClass, actionClass }: TrackActionSlot): ReactNode => (
  <>
    <FavouriteButton item={trackFavourite(track)} className={heartClass} />
    <AddToPlaylist source={track} className={actionClass} />
    <AddToQueue getTracks={() => Promise.resolve([track])} className={actionClass} />
    <AddToQueue next getTracks={() => Promise.resolve([track])} className={actionClass} />
  </>
);

export const albumDetailsActions = (album: Album, { favouriteClass, playlistClass }: AlbumDetailsActionSlot): ReactNode => (
  <>
    <FavouriteButton item={albumFavourite(album)} className={favouriteClass} />
    <AddToPlaylist source={album} className={playlistClass} />
  </>
);

/** Another album starts with its own text and results */
export const albumCoverMenu = (album: Album): ReactNode => <AlbumCoverMenu key={album.id} path={album.path} title={album.title} artist={album.artist} />;
