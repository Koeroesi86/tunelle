import { powerMonitor } from 'electron';
import { readLinuxOnBattery } from './linux-power-source';
import { logError } from '../utils/log-error';
import { defaultPowerSavingMode, readMainSettings } from '@shared/schemas/settings';
import type { PowerSavingMode } from '@shared/schemas/settings';

type Listener = (saving: boolean) => void;

const listeners = new Set<Listener>();
let mode: PowerSavingMode = defaultPowerSavingMode;
let onBatteryNow = false;
let started = false;

/** Whether the computer runs on its battery; the one place that asks `powerMonitor` or the supplies of the kernel. See docs/app/power-saving.md */
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

/** How often Linux is asked, as it tells nothing by itself */
const linuxPollMs = 10_000;

/** Linux has no `on-battery` and `on-ac` events in Electron: the supplies of the kernel are read now and then, which is one small read for ten seconds */
const followLinux = () => {
  const read = () => readLinuxOnBattery().then((onBattery) => update({ onBattery }), logError);
  read();
  setInterval(read, linuxPollMs).unref();
};

/** Follows the power source: by the events of the system on Windows and macOS, by reading the supplies on Linux */
export const startPowerState = () => {
  if (started) return;

  started = true;
  if (process.platform === 'linux') return followLinux();

  onBatteryNow = powerMonitor.isOnBatteryPower();
  powerMonitor.on('on-battery', () => update({ onBattery: true }));
  powerMonitor.on('on-ac', () => update({ onBattery: false }));
};

/** Follow the setting of the window; a missing or invalid one is `auto` */
export const applyPowerSetting = (settings: unknown) => update({ mode: readMainSettings(settings).powerSaving ?? defaultPowerSavingMode });
