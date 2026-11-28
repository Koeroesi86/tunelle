import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/power-saving/PowerSaving';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/power-saving/PowerSaving', () => ({ default: vi.fn(() => null) }));

describe('the container of PowerSaving', () => {
  it('shows the mode and whether power is saved now, and sends another mode', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, powerSaving: 'always', savingPower: true } }));
    const { mode, saving, setMode } = propsOf(View);

    setMode('never');

    expect([mode, saving]).toEqual(['always', true]);
    expect(sent()).toEqual([{ type: 'SET_POWER_SAVING', payload: { mode: 'never' } }]);
  });
});
