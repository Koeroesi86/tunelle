import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/window-controls/WindowControls';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/window-controls/WindowControls', () => ({ default: vi.fn(() => null) }));

describe('the container of WindowControls', () => {
  it('shows whether the window is maximized', () => {
    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, maximized: true } }));

    expect(propsOf(View).maximized).toBe(true);
  });

  it('closes, minimizes and maximizes the window', () => {
    const { sent } = renderContainer(<Container />);
    const { close, minimize, maximize } = propsOf(View);

    close();
    minimize();
    maximize();

    expect(sent()).toEqual([
      { type: 'CLOSE_APP', payload: {} },
      { type: 'MINIMIZE_APP', payload: {} },
      { type: 'MAXIMIZE_APP', payload: {} },
    ]);
  });
});
