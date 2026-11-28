import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/loudness-normalization/LoudnessNormalization';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/loudness-normalization/LoudnessNormalization', () => ({ default: vi.fn(() => null) }));

describe('the container of LoudnessNormalization', () => {
  it('shows the setting of the store and sends its change', () => {
    const { sent } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, normalization: 'album' as const } }));
    const { mode, setMode } = propsOf(View);

    setMode('track');

    expect(mode).toEqual('album' as const);
    expect(sent()).toEqual([{ type: 'SET_NORMALIZATION', payload: { mode: 'track' } }]);
  });
});
