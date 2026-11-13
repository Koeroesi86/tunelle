import { powerMonitor } from 'electron';
import { defaultPowerSavingMode, readMainSettings } from '@shared/schemas/settings';
import type { PowerSavingMode } from '@shared/schemas/settings';

type Listener = (saving: boolean) => void;

const listeners = new Set<Listener>();
let mode: PowerSavingMode = defaultPowerSavingMode;
let onBatteryNow = false;
let started = false;

/** Whether the computer runs on its battery, from the events of the system; the one place that asks `powerMonitor`. See docs/app/power-saving.md */
export const onBattery = () => onBatteryNow;

/** Whether the background work is lowered: on battery when the mode is `auto`, always or never otherwise */
export const savingPower = () => mode === 'always' || (mode === 'auto' && onBatteryNow);

/** Calls `listener` with the new state when `savingPower()` changes; returns the function that stops it */
export const onPowerSavingChange = (listener: Listener) => {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
};

const update = (next: { mode?: PowerSavingMode; onBattery?: boolean }) => {
  const before = savingPower();
  mode = next.mode ?? mode;
  onBatteryNow = next.onBattery ?? onBatteryNow;
  const after = savingPower();
  if (before !== after) [...listeners].forEach((listener) => listener(after));
};

/** Follows the power source: reads it once, then only the `on-battery` and `on-ac` events, so nothing polls for it */
export const startPowerState = () => {
  if (started) return;

  started = true;
  onBatteryNow = powerMonitor.isOnBatteryPower();
  powerMonitor.on('on-battery', () => update({ onBattery: true }));
  powerMonitor.on('on-ac', () => update({ onBattery: false }));
};

/** Follow the setting of the window; a missing or invalid one is `auto` */
export const applyPowerSetting = (settings: unknown) => update({ mode: readMainSettings(settings).powerSaving ?? defaultPowerSavingMode });
