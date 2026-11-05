import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMiddleware, createStore } from 'redux';
import reducers from '../reducers';
import middleware from './middleware';

const info = (kind: string, deviceId: string, label: string) => ({ kind, deviceId, label });

const stubDevices = (devices: ReturnType<typeof info>[]) => {
  const enumerateDevices = vi.fn().mockResolvedValue(devices);
  const addEventListener = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices, addEventListener } });
  return { enumerateDevices, addEventListener };
};

const start = () => {
  const store = createStore(reducers, applyMiddleware(middleware));
  store.dispatch({ type: 'APP_INIT' });
  return store;
};

describe('output devices middleware', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts the outputs in the state by name, without the inputs and the entries that stand for the default', async () => {
    stubDevices([
      info('audioinput', 'm1', 'Microphone'),
      info('audiooutput', 'default', 'Default'),
      info('audiooutput', 'a1', 'USB DAC'),
      info('audiooutput', 'b2', 'Speakers'),
    ]);
    const store = start();

    await vi.waitFor(() =>
      expect(store.getState().uiState.outputDevices).toEqual([
        { id: 'a1', label: 'USB DAC' },
        { id: 'b2', label: 'Speakers' },
      ])
    );
  });

  it('lists nothing while the page may not see the devices: the one placeholder has no id', async () => {
    const { enumerateDevices } = stubDevices([info('audiooutput', '', '')]);
    const store = start();

    await vi.waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
    expect(store.getState().uiState.outputDevices).toEqual([]);
  });

  it('lists the devices again when one is plugged in or unplugged', async () => {
    const { enumerateDevices, addEventListener } = stubDevices([]);
    const store = start();
    await vi.waitFor(() => expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function)));

    enumerateDevices.mockResolvedValue([info('audiooutput', 'a1', 'USB DAC')]);
    addEventListener.mock.calls[0][1]();

    await vi.waitFor(() => expect(store.getState().uiState.outputDevices).toEqual([{ id: 'a1', label: 'USB DAC' }]));
  });

  it('reports a failed listing and goes on', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { enumerateDevices } = stubDevices([]);
    enumerateDevices.mockRejectedValue(new Error('denied'));
    start();

    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('does nothing in a page without media devices', () => {
    vi.stubGlobal('navigator', {});

    expect(() => start()).not.toThrow();
  });
});
