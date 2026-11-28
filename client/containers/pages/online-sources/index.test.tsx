import { describe, expect, it, vi } from 'vitest';
import RadioStations from '../radio-stations';
import RemoteListener from '../remote-listener';
import SourceLibrary from '../source-library';
import SourceServers from '../source-servers';
import View from '../../../components/pages/online-sources/OnlineSources';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/online-sources/OnlineSources', () => ({ default: vi.fn(() => null) }));
vi.mock('../radio-stations', () => ({
  default: function RadioStations() {
    return null;
  },
}));
vi.mock('../remote-listener', () => ({
  default: function RemoteListener() {
    return null;
  },
}));
vi.mock('../source-library', () => ({
  default: function SourceLibrary() {
    return null;
  },
}));
vi.mock('../source-servers', () => ({
  default: function SourceServers() {
    return null;
  },
}));

describe('the container of OnlineSources', () => {
  it('shows the view and sends another', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, onlineView: 'radio' } }));
    const { view, setView } = propsOf(View);

    setView('nearby');

    expect(view).toBe('radio');
    expect(sent()).toEqual([{ type: 'SET_ONLINE_VIEW', payload: { view: 'nearby' } }]);
  });

  it('places the radio, the players nearby, the servers and their libraries', () => {
    renderContainer(<Container />);
    const { radio, nearby, renderServers, renderLibrary } = propsOf(View);
    const openSection = vi.fn();

    expect([radio, nearby]).toEqual([<RadioStations />, <RemoteListener />]);
    expect(renderServers('plex', openSection)).toEqual(<SourceServers kind="plex" openSection={openSection} />);
    expect(renderLibrary('plex', 'albums')).toEqual(<SourceLibrary kind="plex" section="albums" />);
  });
});
