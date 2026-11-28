import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/measure-loudness/MeasureLoudness';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/measure-loudness/MeasureLoudness', () => ({ default: vi.fn(() => null) }));

describe('the container of MeasureLoudness', () => {
  it('shows the setting and what failed', () => {
    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, measureLoudness: true, loudnessFailed: [] } }));

    expect(propsOf(View)).toMatchObject({ enabled: true, status: undefined, failed: [] });
  });

  it('sends the setting, asks for the status and the failures, and clears what was measured', () => {
    const { sent } = renderContainer(<Container />);
    const { setEnabled, loadStatus, loadFailed, clear } = propsOf(View);

    setEnabled(false);
    loadStatus();
    loadFailed();
    clear();

    expect(sent()).toEqual([
      { type: 'SET_MEASURE_LOUDNESS', payload: { enabled: false } },
      { type: 'LOAD_LOUDNESS_STATUS', payload: {} },
      { type: 'LOAD_LOUDNESS_FAILED', payload: {} },
      { type: 'CLEAR_MEASURED_LOUDNESS', payload: {} },
    ]);
  });
});
