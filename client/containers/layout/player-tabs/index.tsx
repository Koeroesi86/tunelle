import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import PlayerTabs from '../../../components/layout/player-tabs/PlayerTabs';
import AlbumDetails from '../../library/album-details';
import About from '../../pages/about';
import Equalizer from '../../pages/equalizer';
import Favourites from '../../pages/favourites';
import GroupOverview from '../../pages/group-overview';
import Home from '../../pages/home';
import LocalCollection from '../../pages/local-collection';
import NowPlaying from '../../pages/now-playing';
import OnlineSources from '../../pages/online-sources';
import PlaylistView from '../../pages/playlist-view';
import ArtistPhotos from '../../settings/artist-photos';
import FolderManagement from '../../settings/folder-management';
import LanguageSelect from '../../settings/language-select';
import LauncherIntegration from '../../settings/launcher-integration';
import LoudnessNormalization from '../../settings/loudness-normalization';
import MeasureLoudness from '../../settings/measure-loudness';
import NotifyLibraryChanges from '../../settings/notify-library-changes';
import OutputDevice from '../../settings/output-device';
import PowerSaving from '../../settings/power-saving';
import ReduceMotion from '../../settings/reduce-motion';
import RemoteAccess from '../../settings/remote-access';
import ThemeSelect from '../../settings/theme-select';
import WatchFolders from '../../settings/watch-folders';
import WindowBlur from '../../settings/window-blur';
import RadioSources from '../../../components/settings/radio-sources';

const pages = {
  home: <Home />,
  'now-playing': <NowPlaying />,
  overview: <GroupOverview />,
  'online-sources': <OnlineSources />,
  favourites: <Favourites />,
  playlist: <PlaylistView />,
  equalizer: <Equalizer />,
};
const renderLocal = (addFiles: (files: FileList) => void) => <LocalCollection addFiles={addFiles} />;
const settings = (
  <>
    <About />
    <ThemeSelect />
    <LanguageSelect />
    <FolderManagement />
    <OutputDevice />
    <LoudnessNormalization />
    <MeasureLoudness />
    <WatchFolders />
    <PowerSaving />
    <NotifyLibraryChanges />
    <ArtistPhotos />
    <RadioSources />
    <WindowBlur />
    <ReduceMotion />
    <LauncherIntegration />
    <RemoteAccess />
  </>
);
const overlay = <AlbumDetails />;

const mapState = (state: RootState) => ({
  tab: state.uiState.tab,
});

export default connect(mapState, undefined, (state, _dispatch, { addFiles }: { addFiles?: (files: FileList) => void }) => ({
  ...state,
  addFiles,
  pages,
  renderLocal,
  settings,
  overlay,
}))(PlayerTabs);
