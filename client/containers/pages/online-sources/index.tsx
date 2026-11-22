import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { LibraryKind, SourceKind } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import type { OnlineView } from '../../../domain/navigation';
import OnlineSources from '../../../components/pages/online-sources/OnlineSources';
import RadioStations from '../radio-stations';
import RemoteListener from '../remote-listener';
import SourceLibrary from '../source-library';
import SourceServers from '../source-servers';

const radio = <RadioStations />;
const nearby = <RemoteListener />;
const renderServers = (kind: SourceKind, openSection: (section: LibraryKind) => void) => <SourceServers kind={kind} openSection={openSection} />;
const renderLibrary = (kind: SourceKind, section: LibraryKind) => <SourceLibrary kind={kind} section={section} />;

const mapState = (state: RootState) => ({
  view: state.uiState.onlineView,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setView: (view: OnlineView) => dispatch({ type: 'SET_ONLINE_VIEW', payload: { view } }),
});

export default connect(mapState, mapDispatch, (state, dispatch) => ({ ...state, ...dispatch, radio, nearby, renderServers, renderLibrary }))(OnlineSources);
