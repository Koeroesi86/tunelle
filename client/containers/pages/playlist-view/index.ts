import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { Track } from '@shared/types/library';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import PlaylistView from '../../../components/pages/playlist-view/PlaylistView';

const mapState = ({ playlists, uiState }: RootState) => ({
  playlist: playlists.find(({ id }) => id === uiState.playlistId),
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  playTracks: (tracks: Track[]) => dispatch({ type: 'PLAY_TRACKS', payload: { tracks } }),
  rename: (id: number, name: string) => dispatch({ type: 'RENAME_PLAYLIST', payload: { id, name } }),
  remove: (id: number, deleteFile?: boolean) => dispatch({ type: 'DELETE_PLAYLIST', payload: { id, deleteFile } }),
  exportPlaylist: (id: number) => dispatch({ type: 'EXPORT_PLAYLIST', payload: { id } }),
  setSync: (id: number, sync: boolean) => dispatch({ type: 'SYNC_PLAYLIST_FILE', payload: { id, sync } }),
  setEncoding: (id: number, encoding?: string) => dispatch({ type: 'SET_PLAYLIST_ENCODING', payload: { id, encoding } }),
  undoImport: (id: number) => dispatch({ type: 'UNDO_PLAYLIST_IMPORT', payload: { id } }),
  removeEntry: (id: number, entryId: number) => dispatch({ type: 'REMOVE_FROM_PLAYLIST', payload: { id, entryId } }),
  moveEntry: (id: number, entryId: number, toIndex: number) => dispatch({ type: 'MOVE_PLAYLIST_ENTRY', payload: { id, entryId, toIndex } }),
});

export default connect(mapState, mapDispatch)(PlaylistView);
