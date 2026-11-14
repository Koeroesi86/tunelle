import { readdir, readFile } from 'fs/promises';
import path from 'path';

const root = '/sys/class/power_supply';

const readValue = async (supply: string, file: string) => (await readFile(path.join(root, supply, file), 'utf8').catch(() => '')).trim();

/** Whether the computer runs on its battery, from the power supplies of the kernel: none of the mains is online and a battery of the computer discharges. Linux gives no event for it. See docs/app/power-saving.md */
export const readLinuxOnBattery = async () => {
  const supplies = await readdir(root).catch(() => []);
  const states = await Promise.all(
    supplies.map(async (supply) => ({
      type: await readValue(supply, 'type'),
      scope: await readValue(supply, 'scope'),
      online: await readValue(supply, 'online'),
      status: await readValue(supply, 'status'),
    }))
  );
  const mainsOnline = states.some(({ type, online }) => type === 'Mains' && online === '1');
  // a battery of a device (a mouse, a headset) is not the one of the computer
  const discharging = states.some(({ type, scope, status }) => type === 'Battery' && scope !== 'Device' && status === 'Discharging');
  return !mainsOnline && discharging;
};
