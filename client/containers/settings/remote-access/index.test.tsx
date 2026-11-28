import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/settings/remote-access/RemoteAccess';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/settings/remote-access/RemoteAccess', () => ({ default: vi.fn(() => null) }));

describe('the container of RemoteAccess', () => {
  it('shows the state of the host mode', () => {
    const remoteHost = { enabled: true, name: 'Desk', loopbackOnly: false, maxListeners: 2, running: true, addresses: [], pending: [], devices: [] };

    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, remoteHost } }));

    expect(propsOf(View).state).toEqual(remoteHost);
  });

  it('sends the changes of the host mode and what is decided about a device', () => {
    const { sent } = renderContainer(<Container />);
    const { setEnabled, update, decide, setControls } = propsOf(View);

    setEnabled(true);
    update({ port: 4000 });
    decide('phone', 'block');
    setControls('phone', ['skip']);

    expect(sent()).toEqual([
      { type: 'SET_REMOTE_HOST', payload: { enabled: true } },
      { type: 'SET_REMOTE_HOST', payload: { port: 4000 } },
      { type: 'DECIDE_REMOTE_DEVICE', payload: { deviceId: 'phone', action: 'block' } },
      { type: 'SET_REMOTE_DEVICE_CONTROLS', payload: { deviceId: 'phone', controls: ['skip'] } },
    ]);
  });
});
