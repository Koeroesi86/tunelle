import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { sendPowerSaving } from './send-power-saving';

const power = vi.hoisted(() => ({ saving: false, listeners: new Set<(saving: boolean) => void>() }));

vi.mock('./power-state', () => ({
  savingPower: () => power.saving,
  onPowerSavingChange: (listener: (saving: boolean) => void) => {
    power.listeners.add(listener);
    return () => power.listeners.delete(listener);
  },
}));

describe('sendPowerSaving', () => {
  const setup = () => {
    const send = vi.fn();
    const destroyed: (() => void)[] = [];
    const sender = { send, isDestroyed: () => false, once: (_event: string, handler: () => void) => destroyed.push(handler) } as unknown as WebContents;
    power.listeners.clear();
    return { send, destroyed, sender };
  };

  it('tells the window the state now, and every change after that', () => {
    const { send, sender } = setup();
    power.saving = true;

    sendPowerSaving(sender);
    [...power.listeners].forEach((listener) => listener(false));

    expect(send.mock.calls).toEqual([
      ['POWER_SAVING', { saving: true }],
      ['POWER_SAVING', { saving: false }],
    ]);
  });

  it('stops when the window is gone', () => {
    const { destroyed, sender } = setup();

    sendPowerSaving(sender);
    destroyed.forEach((handler) => handler());

    expect(power.listeners.size).toBe(0);
  });
});
