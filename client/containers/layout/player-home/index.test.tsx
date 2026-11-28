import { describe, expect, it, vi } from 'vitest';
import AudioComponent from '../audio-component';
import LauncherOffer from '../launcher-offer';
import Navigation from '../navigation';
import PlayerControls from '../player-controls';
import PlayerIntegrations from '../player-integrations';
import PlayerTabs from '../player-tabs';
import PlaylistImportReport from '../playlist-import-report';
import RemoteRequest from '../remote-request';
import TitleBar from '../title-bar';
import View from '../../../components/layout/player-home/PlayerHome';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const backend = vi.hoisted(() => ({ capabilities: { blur: false, opaque: false }, pathForFile: vi.fn() }));

vi.mock('../../../components/layout/player-home/PlayerHome', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../backend/backend', () => ({ getBackend: () => backend }));
vi.mock('../audio-component', () => ({
  default: function AudioComponent() {
    return null;
  },
}));
vi.mock('../launcher-offer', () => ({
  default: function LauncherOffer() {
    return null;
  },
}));
vi.mock('../navigation', () => ({
  default: function Navigation() {
    return null;
  },
}));
vi.mock('../player-controls', () => ({
  default: function PlayerControls() {
    return null;
  },
}));
vi.mock('../player-integrations', () => ({
  default: function PlayerIntegrations() {
    return null;
  },
}));
vi.mock('../player-tabs', () => ({
  default: function PlayerTabs() {
    return null;
  },
}));
vi.mock('../playlist-import-report', () => ({
  default: function PlaylistImportReport() {
    return null;
  },
}));
vi.mock('../remote-request', () => ({
  default: function RemoteRequest() {
    return null;
  },
}));
vi.mock('../title-bar', () => ({
  default: function TitleBar() {
    return null;
  },
}));

describe('the container of PlayerHome', () => {
  it.each([
    { window: 'the system blurs', blur: true, opaque: false, desktopBlur: false, softwareRendering: false, blurred: true },
    { window: 'can be seen through, with the blur of the desktop on', blur: false, opaque: false, desktopBlur: true, softwareRendering: false, blurred: true },
    { window: 'can be seen through, with that blur off', blur: false, opaque: false, desktopBlur: false, softwareRendering: false, blurred: false },
    { window: 'is opaque', blur: false, opaque: true, desktopBlur: true, softwareRendering: false, blurred: false },
    { window: 'is drawn without a GPU', blur: true, opaque: false, desktopBlur: true, softwareRendering: true, blurred: false },
  ])('is blurred when the window $window: $blurred', ({ blur, opaque, desktopBlur, softwareRendering, blurred }) => {
    Object.assign(backend.capabilities, { blur, opaque });

    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, desktopBlur, softwareRendering } }));

    expect(propsOf(View).blurred).toBe(blurred);
  });

  it('gives whether the library is loaded, whether the window is maximized and the folders', () => {
    const { store } = renderContainer(<Container />);
    const { library, uiState, folders } = store.getState();

    expect(propsOf(View)).toMatchObject({ loaded: library.loaded, maximized: uiState.maximized, folders });
  });

  it('adds dropped files by their paths, and saves the settings when the window goes', () => {
    const files = document.createElement('input');
    files.type = 'file';
    const file = new File([], 'a.flac');
    const { sent } = renderContainer(<Container />);
    const { addFiles, pathForFile, onUnload } = propsOf(View);

    addFiles(files.files ?? new DataTransfer().files);
    pathForFile(file);
    onUnload();

    expect(backend.pathForFile).toHaveBeenCalledWith(file);
    expect(sent()).toEqual([
      { type: 'FILES_ADDED', payload: { fileList: files.files } },
      { type: 'SAVE_SETTINGS', payload: {} },
    ]);
  });

  it('places the parts of the player', () => {
    renderContainer(<Container />);
    const { renderTitleBar, renderNavigation, renderTabs, controls, overlays } = propsOf(View);
    const slot = { onMenu: vi.fn(), menuOpen: true };
    const rail = { rail: true, onNavigate: vi.fn(), spectrum: true };
    const addFiles = vi.fn();

    expect(renderTitleBar(slot)).toEqual(<TitleBar {...slot} />);
    expect(renderNavigation(rail)).toEqual(<Navigation {...rail} />);
    expect(renderTabs(addFiles)).toEqual(<PlayerTabs addFiles={addFiles} />);
    expect(controls).toEqual(<PlayerControls />);
    expect(overlays).toEqual(
      <>
        <LauncherOffer />
        <RemoteRequest />
        <PlaylistImportReport />
        <AudioComponent />
        <PlayerIntegrations />
      </>
    );
  });
});
