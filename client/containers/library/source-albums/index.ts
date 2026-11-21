import type { ReactNode } from 'react';
import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { AlbumSummary } from '@shared/types/library';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { listKey } from '../../../redux/sources/lists';
import AlbumView from '../../../components/library/album-view/AlbumView';
import { loadSourcePage, pagesAhead, unanswered } from '../source-list';

interface OwnProps {
  /** The first page of the list, which says the server and what is listed of it */
  request: SourceBrowse;
  /** Playing an album opens it as well, its tracks are fetched when it is opened */
  open: (album: AlbumSummary) => void;
  toolbar?: ReactNode;
}

const mapState = (state: RootState, { request }: OwnProps) => ({
  albums: state.sources.lists.albums[listKey(request)] ?? unanswered,
  coverSize: state.uiState.coverSize,
  search: request.what === 'search' ? request.query : undefined,
});

const mapDispatch = (dispatch: Dispatch<AppAction>, { request }: OwnProps) => ({
  loadPage: loadSourcePage(dispatch, request),
  setCoverSize: (size: number) => dispatch({ type: 'SET_COVER_SIZE', payload: { size } }),
});

export default connect(mapState, mapDispatch, (state, dispatch, { open, toolbar }: OwnProps) => ({
  ...state,
  ...dispatch,
  pagesAhead,
  sort: undefined,
  toolbar,
  openAlbum: open,
  playAlbum: open,
}))(AlbumView);
