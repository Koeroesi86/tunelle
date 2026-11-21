import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import { getBackend } from '../../../backend/backend';
import PlayerHome from '../../../components/layout/player-home/PlayerHome';
import type { NavigationSlot, TitleBarSlot } from '../../../components/layout/player-home/PlayerHome';
import AudioComponent from '../audio-component';
import LauncherOffer from '../launcher-offer';
import Navigation from '../navigation';
import PlayerControls from '../player-controls';
import PlayerIntegrations from '../player-integrations';
import PlayerTabs from '../player-tabs';
import PlaylistImportReport from '../playlist-import-report';
import RemoteRequest from '../remote-request';
import TitleBar from '../title-bar';

const renderTitleBar = ({ onMenu, menuOpen }: TitleBarSlot) => <TitleBar onMenu={onMenu} menuOpen={menuOpen} />;
const renderNavigation = ({ rail, onNavigate, spectrum }: NavigationSlot) => <Navigation rail={rail} onNavigate={onNavigate} spectrum={spectrum} />;
const renderTabs = (addFiles: (files: FileList) => void) => <PlayerTabs addFiles={addFiles} />;
const controls = <PlayerControls />;
const overlays = (
  <>
    <LauncherOffer />
    <RemoteRequest />
    <PlaylistImportReport />
    <AudioComponent />
    <PlayerIntegrations />
  </>
);

const mapState = (state: RootState) => ({
  loaded: state.library.loaded,
  maximized: state.uiState.maximized,
  blurred: !state.uiState.softwareRendering && (getBackend().capabilities.blur || state.uiState.desktopBlur),
  folders: state.folders,
});
const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  addFiles: (fileList: FileList) => dispatch({ type: 'FILES_ADDED', payload: { fileList } }),
  pathForFile: (file: File) => getBackend().pathForFile(file),
  onUnload: () => dispatch({ type: 'SAVE_SETTINGS', payload: {} }),
});

export default connect(mapState, mapDispatch, (state, dispatch) => ({
  ...state,
  ...dispatch,
  renderTitleBar,
  renderNavigation,
  renderTabs,
  controls,
  overlays,
}))(PlayerHome);
