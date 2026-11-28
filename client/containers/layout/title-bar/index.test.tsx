import { describe, expect, it, vi } from 'vitest';
import QueueIndicator from '../queue-indicator';
import WindowControls from '../window-controls';
import View from '../../../components/layout/title-bar/TitleBar';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/title-bar/TitleBar', () => ({ default: vi.fn(() => null) }));
vi.mock('../queue-indicator', () => ({
  default: function QueueIndicator() {
    return null;
  },
}));
vi.mock('../window-controls', () => ({
  default: function WindowControls() {
    return null;
  },
}));

describe('the container of TitleBar', () => {
  it('shows what is played, with the indicator of the queue and the buttons of the window', () => {
    const { store } = renderContainer(<Container onMenu={vi.fn()} menuOpen={false} />);
    const { currentSong, streamTitle, streamArt } = store.getState().uiState;

    expect(propsOf(View)).toMatchObject({ currentSong, streamTitle, streamArt });
    expect(propsOf(View).actions).toEqual(
      <>
        <QueueIndicator />
        <WindowControls />
      </>
    );
  });

  it('passes on the menu button of a compact window', () => {
    const onMenu = vi.fn();

    renderContainer(<Container onMenu={onMenu} menuOpen />);

    expect(propsOf(View)).toMatchObject({ onMenu, menuOpen: true });
  });

  it('opens the page of what is played', () => {
    const { sent } = renderContainer(<Container onMenu={vi.fn()} menuOpen={false} />);

    propsOf(View).openNowPlaying?.();

    expect(sent()).toEqual([{ type: 'SET_TAB', payload: { tab: 'now-playing' } }]);
  });
});
