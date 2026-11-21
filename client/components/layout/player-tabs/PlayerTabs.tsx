import classNames from 'classnames';
import type { Tab } from '../../../redux/types';
import AlbumDetails from '../../../containers/library/album-details';
import Home from '../../../containers/pages/home';
import LocalCollection from '../../../containers/pages/local-collection';
import NowPlaying from '../../../containers/pages/now-playing';
import OnlineSources from '../../../containers/pages/online-sources';
import Favourites from '../../../containers/pages/favourites';
import PlaylistView from '../../../containers/pages/playlist-view';
import Equalizer from '../../../containers/pages/equalizer';
import FolderManagement from '../../../containers/settings/folder-management';
import ArtistPhotos from '../../../containers/settings/artist-photos';
import RadioSources from '../../settings/radio-sources';
import LoudnessNormalization from '../../../containers/settings/loudness-normalization';
import MeasureLoudness from '../../../containers/settings/measure-loudness';
import OutputDevice from '../../../containers/settings/output-device';
import WatchFolders from '../../../containers/settings/watch-folders';
import PowerSaving from '../../../containers/settings/power-saving';
import NotifyLibraryChanges from '../../../containers/settings/notify-library-changes';
import LauncherIntegration from '../../../containers/settings/launcher-integration';
import RemoteAccess from '../../../containers/settings/remote-access';
import WindowBlur from '../../../containers/settings/window-blur';
import ReduceMotion from '../../../containers/settings/reduce-motion';
import About from '../../../containers/pages/about';
import LanguageSelect from '../../../containers/settings/language-select';
import ThemeSelect from '../../../containers/settings/theme-select';
import style from './PlayerTabs.scss';

interface PlayerTabsProps {
  tab?: Tab;
  addFiles?: (files: FileList) => void;
}

function PlayerTabs({ tab = 'home', addFiles = () => {} }: PlayerTabsProps) {
  return (
    <div className={style.collection}>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'home',
        })}
      >
        <Home />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'local',
        })}
      >
        <LocalCollection addFiles={addFiles} />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'now-playing',
        })}
      >
        <NowPlaying />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'online-sources',
        })}
      >
        <OnlineSources />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'favourites',
        })}
      >
        <Favourites />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'playlist',
        })}
      >
        <PlaylistView />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'equalizer',
        })}
      >
        <Equalizer />
      </div>
      <div
        className={classNames(style.tab, {
          [style.active]: tab === 'settings',
        })}
      >
        <div className={style.settings}>
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
        </div>
      </div>
      <AlbumDetails />
    </div>
  );
}

export default PlayerTabs;
