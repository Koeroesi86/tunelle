import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/reduce-motion/ReduceMotion';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/reduce-motion/ReduceMotion', () => ({ default: vi.fn(() => null) }));

describe('the container of ReduceMotion', () => {
  it('shows whether motion is reduced, and asks to toggle it', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, reduceMotion: true } }));
    const { enabled, toggle } = propsOf(View);

    toggle();

    expect(enabled).toBe(true);
    expect(sent()).toEqual([{ type: 'TOGGLE_REDUCE_MOTION', payload: {} }]);
  });
});
