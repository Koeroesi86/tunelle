import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/launcher-offer/LauncherOffer';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/launcher-offer/LauncherOffer', () => ({ default: vi.fn(() => null) }));

describe('the container of LauncherOffer', () => {
  it('shows where the app is in the application menu, and adds it', () => {
    const launcher = { available: true, enabled: false, offered: false, external: false };
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, launcher } }));
    const props = propsOf(View);

    props.setEnabled(true);

    expect(props).toMatchObject(launcher);
    expect(sent()).toEqual([{ type: 'SET_LAUNCHER', payload: { enabled: true } }]);
  });
});
