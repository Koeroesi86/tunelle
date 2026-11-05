import classNames from 'classnames';
import type { Tab } from '../../../redux/types';
import Home from '../../pages/home';
import LocalCollection from '../../pages/local-collection';
import NowPlaying from '../../pages/now-playing';
import OnlineSources from '../../pages/online-sources';
import Favourites from '../../pages/favourites';
import PlaylistView from '../../pages/playlist-view';
import Equalizer from '../../pages/equalizer';
import FolderManagement from '../../settings/folder-management';
import ArtistPhotos from '../../settings/artist-photos';
import RadioSources from '../../settings/radio-sources';
import LoudnessNormalization from '../../settings/loudness-normalization';
import OutputDevice from '../../settings/output-device';
import WatchFolders from '../../settings/watch-folders';
import LauncherIntegration from '../../settings/launcher-integration';
import WindowBlur from '../../settings/window-blur';
import About from '../../pages/about';
import LanguageSelect from '../../settings/language-select';
import ThemeSelect from '../../settings/theme-select';
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
          <WatchFolders />
          <ArtistPhotos />
          <RadioSources />
          <WindowBlur />
          <LauncherIntegration />
        </div>
      </div>
    </div>
  );
}

export default PlayerTabs;
