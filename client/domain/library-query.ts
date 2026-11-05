import type { Folder } from '@shared/types/library';
import type { AlbumQuery, GroupQuery, LibraryQuery, TrackSort } from '@shared/types/library-query';
import { knownFolders, parseSearch } from '@shared/types/library-query';
import type { RootState } from '../redux/reducers';

type QueryState = Pick<RootState, 'folders' | 'uiState'>;

/** The selected folders that the library still has */
export const selectedFolders = (selected: string[], folders: Folder[]) =>
  knownFolders(
    selected,
    folders.map(({ path }) => path)
  );

/** The text to search for, undefined when the search is empty */
export const selectSearch = (state: Pick<RootState, 'uiState'>) => parseSearch(state.uiState.librarySearch);

/** What the tracks are asked for: the sort, the selected folders the library still has and the search */
export const selectTrackQuery = (state: QueryState): LibraryQuery<TrackSort> => ({
  sort: state.uiState.trackSort,
  folders: selectedFolders(state.uiState.libraryFolders, state.folders),
  search: selectSearch(state),
});

export const selectAlbumQuery = (state: QueryState): AlbumQuery => ({
  sort: state.uiState.albumSort,
  folders: selectedFolders(state.uiState.libraryFolders, state.folders),
  search: selectSearch(state),
});

/** What the albums of the open artist, album artist or genre are asked for: the album sort and folders, and the group */
export const selectGroupAlbumQuery = (state: QueryState): AlbumQuery => ({
  ...selectAlbumQuery(state),
  group: state.uiState.openGroup && { kind: state.uiState.openGroup.kind, key: state.uiState.openGroup.key },
});

/** What the artists, the album artists and the genres are asked for: the sort, the selected folders and the text of the filter */
export const selectGroupQuery = (state: QueryState): GroupQuery => ({
  sort: state.uiState.groupSort,
  folders: selectedFolders(state.uiState.libraryFolders, state.folders),
  filter: state.uiState.groupFilter,
});
