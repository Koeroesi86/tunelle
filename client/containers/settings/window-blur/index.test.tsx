import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/window-blur/WindowBlur';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const capabilities = vi.hoisted(() => ({ blur: false, opaque: false }));

vi.mock('../../../components/settings/window-blur/WindowBlur', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../backend/backend', () => ({ getBackend: () => ({ capabilities }) }));

describe('the container of WindowBlur', () => {
  it.each([
    { system: 'draws no blur and can be seen through', blur: false, opaque: false, softwareRendering: false, available: true },
    { system: 'blurs the window itself', blur: true, opaque: false, softwareRendering: false, available: false },
    { system: 'has no transparent window', blur: false, opaque: true, softwareRendering: false, available: false },
    { system: 'draws without a GPU', blur: false, opaque: false, softwareRendering: true, available: false },
  ])('offers the blur on a system that $system: $available', ({ blur, opaque, softwareRendering, available }) => {
    capabilities.blur = blur;
    capabilities.opaque = opaque;

    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, softwareRendering, desktopBlur: true } }));

    expect(propsOf(View)).toMatchObject({ available, enabled: true });
  });

  it('toggles the blur', () => {
    const { sent } = renderContainer(<Container />);

    propsOf(View).toggle();

    expect(sent()).toEqual([{ type: 'TOGGLE_DESKTOP_BLUR', payload: {} }]);
  });
});
