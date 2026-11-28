import { describe, expect, it, vi } from 'vitest';
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
import View from '../../../components/layout/player-tabs/PlayerTabs';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/player-tabs/PlayerTabs', () => ({ default: vi.fn(() => null) }));
vi.mock('../../library/album-details', () => ({
  default: function AlbumDetails() {
    return null;
  },
}));
vi.mock('../../pages/about', () => ({
  default: function About() {
    return null;
  },
}));
vi.mock('../../pages/equalizer', () => ({
  default: function Equalizer() {
    return null;
  },
}));
vi.mock('../../pages/favourites', () => ({
  default: function Favourites() {
    return null;
  },
}));
vi.mock('../../pages/group-overview', () => ({
  default: function GroupOverview() {
    return null;
  },
}));
vi.mock('../../pages/home', () => ({
  default: function Home() {
    return null;
  },
}));
vi.mock('../../pages/local-collection', () => ({
  default: function LocalCollection() {
    return null;
  },
}));
vi.mock('../../pages/now-playing', () => ({
  default: function NowPlaying() {
    return null;
  },
}));
vi.mock('../../pages/online-sources', () => ({
  default: function OnlineSources() {
    return null;
  },
}));
vi.mock('../../pages/playlist-view', () => ({
  default: function PlaylistView() {
    return null;
  },
}));
vi.mock('../../settings/artist-photos', () => ({
  default: function ArtistPhotos() {
    return null;
  },
}));
vi.mock('../../settings/folder-management', () => ({
  default: function FolderManagement() {
    return null;
  },
}));
vi.mock('../../settings/language-select', () => ({
  default: function LanguageSelect() {
    return null;
  },
}));
vi.mock('../../settings/launcher-integration', () => ({
  default: function LauncherIntegration() {
    return null;
  },
}));
vi.mock('../../settings/loudness-normalization', () => ({
  default: function LoudnessNormalization() {
    return null;
  },
}));
vi.mock('../../settings/measure-loudness', () => ({
  default: function MeasureLoudness() {
    return null;
  },
}));
vi.mock('../../settings/notify-library-changes', () => ({
  default: function NotifyLibraryChanges() {
    return null;
  },
}));
vi.mock('../../settings/output-device', () => ({
  default: function OutputDevice() {
    return null;
  },
}));
vi.mock('../../settings/power-saving', () => ({
  default: function PowerSaving() {
    return null;
  },
}));
vi.mock('../../settings/reduce-motion', () => ({
  default: function ReduceMotion() {
    return null;
  },
}));
vi.mock('../../settings/remote-access', () => ({
  default: function RemoteAccess() {
    return null;
  },
}));
vi.mock('../../settings/theme-select', () => ({
  default: function ThemeSelect() {
    return null;
  },
}));
vi.mock('../../settings/watch-folders', () => ({
  default: function WatchFolders() {
    return null;
  },
}));
vi.mock('../../settings/window-blur', () => ({
  default: function WindowBlur() {
    return null;
  },
}));
vi.mock('../../../components/settings/radio-sources', () => ({
  default: function RadioSources() {
    return null;
  },
}));

describe('the container of PlayerTabs', () => {
  it('shows the open tab, and gives the page what adds files', () => {
    const addFiles = vi.fn();

    renderContainer(<Container addFiles={addFiles} />, (state) => ({ ...state, uiState: { ...state.uiState, tab: 'equalizer' } }));

    expect(propsOf(View)).toMatchObject({ tab: 'equalizer', addFiles });
    expect(propsOf(View).renderLocal(addFiles)).toEqual(<LocalCollection addFiles={addFiles} />);
  });

  it('has a page for every tab, and the details of an album over them', () => {
    renderContainer(<Container />);

    expect(propsOf(View).pages).toEqual({
      home: <Home />,
      'now-playing': <NowPlaying />,
      overview: <GroupOverview />,
      'online-sources': <OnlineSources />,
      favourites: <Favourites />,
      playlist: <PlaylistView />,
      equalizer: <Equalizer />,
    });
    expect(propsOf(View).overlay).toEqual(<AlbumDetails />);
  });

  it('lists the settings in their order', () => {
    renderContainer(<Container />);

    expect(propsOf(View).settings).toEqual(
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
  });
});
