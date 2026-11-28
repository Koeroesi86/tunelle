import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/launcher-integration/LauncherIntegration';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/launcher-integration/LauncherIntegration', () => ({ default: vi.fn(() => null) }));

describe('the container of LauncherIntegration', () => {
  it('shows where the app is in the application menu, and adds or removes it', () => {
    const launcher = { available: true, enabled: false, offered: true, external: true };
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, launcher } }));
    const props = propsOf(View);

    props.setEnabled(true);

    expect(props).toMatchObject({ available: true, enabled: false, external: true });
    expect(sent()).toEqual([{ type: 'SET_LAUNCHER', payload: { enabled: true } }]);
  });
});
