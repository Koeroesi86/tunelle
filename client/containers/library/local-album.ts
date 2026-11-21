import type { Dispatch } from 'redux';
import type { AlbumSummary } from '@shared/types/library';
import type { AppAction } from '../../redux/types';
import { fetchAlbum } from '../../services/library-api';

/** Opening or playing an album of the local library: the listing has the albums only, so its tracks are fetched first */
export const localAlbumActions = (dispatch: Dispatch<AppAction>) => ({
  openAlbum: (album: AlbumSummary) =>
    fetchAlbum(album)
      .then((opened) => dispatch({ type: 'SELECT_ALBUM', payload: { album: opened } }))
      .catch(console.error),
  playAlbum: (album: AlbumSummary) =>
    fetchAlbum(album)
      .then(({ tracks }) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }))
      .catch(console.error),
});
