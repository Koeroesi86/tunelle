import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/output-device/OutputDevice';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/output-device/OutputDevice', () => ({ default: vi.fn(() => null) }));

describe('the container of OutputDevice', () => {
  it('shows the outputs and the chosen one, and sends another choice', () => {
    const speakers = { id: 'speakers', label: 'Speakers' };
    const { sent } = renderContainer(<Container />, (state) => ({
      ...state,
      uiState: { ...state.uiState, outputDevice: speakers, outputDevices: [speakers] },
    }));
    const { device, devices, setDevice } = propsOf(View);

    setDevice(undefined);

    expect([device, devices]).toEqual([speakers, [speakers]]);
    expect(sent()).toEqual([{ type: 'SET_OUTPUT_DEVICE', payload: { device: undefined } }]);
  });
});
