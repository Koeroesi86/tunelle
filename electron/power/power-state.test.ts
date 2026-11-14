import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = () => void;

const monitor = vi.hoisted(() => ({ handlers: new Map<string, () => void>(), battery: false }));

vi.mock('electron', () => ({
  powerMonitor: {
    isOnBatteryPower: () => monitor.battery,
    on: (event: string, handler: Handler) => monitor.handlers.set(event, handler),
  },
}));

const linux = vi.hoisted(() => ({ onBattery: false }));

vi.mock('./linux-power-source', () => ({ readLinuxOnBattery: async () => linux.onBattery }));

const platform = process.platform;
const setPlatform = (value: string) => Object.defineProperty(process, 'platform', { value });

describe('the power state', () => {
  afterEach(() => setPlatform(platform));

  const load = async () => {
    vi.resetModules();
    monitor.handlers.clear();
    return import('./power-state');
  };

  beforeEach(() => {
    monitor.battery = false;
    setPlatform('win32');
  });

  it('is not saving power before it starts', async () => {
    const { onBattery, savingPower } = await load();

    expect([onBattery(), savingPower()]).toEqual([false, false]);
  });

  it('reads the power source once when it starts, and follows the events after that', async () => {
    monitor.battery = true;
    const { startPowerState, onBattery, savingPower } = await load();

    startPowerState();
    expect([onBattery(), savingPower()]).toEqual([true, true]);

    monitor.handlers.get('on-ac')?.();
    expect([onBattery(), savingPower()]).toEqual([false, false]);
    monitor.handlers.get('on-battery')?.();
    expect(savingPower()).toBe(true);
  });

  it('listens to the system only once, however often it starts', async () => {
    const { startPowerState } = await load();

    startPowerState();
    const handler = monitor.handlers.get('on-battery');
    startPowerState();

    expect(monitor.handlers.get('on-battery')).toBe(handler);
  });

  it('tells the listeners when saving changes, not when only the source does', async () => {
    const { startPowerState, applyPowerSetting, onPowerSavingChange } = await load();
    const listener = vi.fn();
    startPowerState();
    onPowerSavingChange(listener);

    monitor.handlers.get('on-battery')?.();
    expect(listener).toHaveBeenLastCalledWith(true);

    applyPowerSetting({ powerSaving: 'always' });
    monitor.handlers.get('on-ac')?.();
    expect(listener).toHaveBeenCalledTimes(1);

    applyPowerSetting({ powerSaving: 'auto' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['auto', true, true],
    ['auto', false, false],
    ['always', false, true],
    ['always', true, true],
    ['never', true, false],
    ['never', false, false],
  ])('with the mode %s and battery %s saving is %s', async (mode, battery, expected) => {
    monitor.battery = battery;
    const { startPowerState, applyPowerSetting, savingPower } = await load();

    startPowerState();
    applyPowerSetting({ powerSaving: mode });

    expect(savingPower()).toBe(expected);
  });

  it('takes auto for a setting that is missing or not a mode', async () => {
    monitor.battery = true;
    const { startPowerState, applyPowerSetting, savingPower } = await load();
    startPowerState();

    applyPowerSetting({ powerSaving: 'never' });
    expect(savingPower()).toBe(false);
    applyPowerSetting({ powerSaving: 'sometimes' });
    expect(savingPower()).toBe(true);
    applyPowerSetting({ powerSaving: 'never' });
    applyPowerSetting(undefined);
    expect(savingPower()).toBe(true);
  });

  it('stops calling a listener that was removed', async () => {
    const { applyPowerSetting, onPowerSavingChange } = await load();
    const listener = vi.fn();

    onPowerSavingChange(listener)();
    applyPowerSetting({ powerSaving: 'always' });

    expect(listener).not.toHaveBeenCalled();
  });

  describe('on Linux, where the system gives no events', () => {
    beforeEach(() => {
      setPlatform('linux');
      vi.useFakeTimers();
      linux.onBattery = true;
    });
    afterEach(() => vi.useRealTimers());

    it('reads the supplies at start and every ten seconds, and tells the change', async () => {
      const { startPowerState, savingPower, onPowerSavingChange } = await load();
      const listener = vi.fn();
      onPowerSavingChange(listener);

      startPowerState();
      await vi.advanceTimersByTimeAsync(0);
      expect(savingPower()).toBe(true);
      expect(monitor.handlers.size).toBe(0);

      linux.onBattery = false;
      await vi.advanceTimersByTimeAsync(9000);
      expect(savingPower()).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(savingPower()).toBe(false);
      expect(listener.mock.calls).toEqual([[true], [false]]);
    });
  });
});
