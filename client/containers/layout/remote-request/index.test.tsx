import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/layout/remote-request/RemoteRequest';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/layout/remote-request/RemoteRequest', () => ({ default: vi.fn(() => null) }));

describe('the container of RemoteRequest', () => {
  const first = { deviceId: 'phone', deviceName: 'Phone', note: '1234', at: 1 };
  const host = { enabled: true, name: 'Desk', loopbackOnly: false, maxListeners: 2, running: true, addresses: [], devices: [], code: '9999' };

  it('shows the first device that waits, with the code of the host', () => {
    const remoteHost = { ...host, pending: [first, { ...first, deviceId: 'tablet' }] };

    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, remoteHost } }));

    expect(propsOf(View)).toMatchObject({ request: first, code: '9999' });
  });

  it('has nothing to show before the host mode is known, and sends what is decided', () => {
    const { sent } = renderContainer(<Container />);
    const { request, code, decide } = propsOf(View);

    decide('phone', 'approve');

    expect([request, code]).toEqual([undefined, undefined]);
    expect(sent()).toEqual([{ type: 'DECIDE_REMOTE_DEVICE', payload: { deviceId: 'phone', action: 'approve' } }]);
  });
});
