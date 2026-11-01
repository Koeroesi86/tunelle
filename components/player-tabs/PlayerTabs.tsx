import classNames from 'classnames';
import type { Tab } from '../../client/redux/types';
import Home from '../home';
import LocalCollection from '../local-collection';
import NowPlaying from '../now-playing';
import OnlineSources from '../online-sources';
import Favourites from '../favourites';
import PlaylistView from '../playlist-view';
import Equalizer from '../equalizer';
import FolderManagement from '../folder-management';
import ArtistPhotos from '../artist-photos';
import RadioSources from '../radio-sources';
import LoudnessNormalization from '../loudness-normalization';
import WatchFolders from '../watch-folders';
import LauncherIntegration from '../launcher-integration';
import WindowBlur from '../window-blur';
import About from '../about';
import LanguageSelect from '../language-select';
import ThemeSelect from '../theme-select';
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
