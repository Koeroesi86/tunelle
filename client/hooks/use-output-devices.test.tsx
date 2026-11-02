import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOutputDevices } from './use-output-devices';

const info = (kind: string, deviceId: string, label: string) => ({ kind, deviceId, label });

const stubDevices = (devices: ReturnType<typeof info>[]) =>
  vi.stubGlobal('navigator', {
    mediaDevices: { enumerateDevices: vi.fn().mockResolvedValue(devices), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });

describe('useOutputDevices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the outputs by name, without the inputs and the entries that stand for the default', async () => {
    stubDevices([
      info('audioinput', 'm1', 'Microphone'),
      info('audiooutput', 'default', 'Default'),
      info('audiooutput', 'a1', 'USB DAC'),
      info('audiooutput', 'b2', 'Speakers'),
    ]);
    const { result } = renderHook(() => useOutputDevices());

    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 'a1', label: 'USB DAC' },
        { id: 'b2', label: 'Speakers' },
      ])
    );
  });

  it('lists nothing while the page may not see the devices: the one placeholder has no id', async () => {
    stubDevices([info('audiooutput', '', '')]);
    const { result } = renderHook(() => useOutputDevices());

    await waitFor(() => expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
