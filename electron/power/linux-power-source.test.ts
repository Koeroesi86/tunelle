import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLinuxOnBattery } from './linux-power-source';

const files = vi.hoisted(() => ({ supplies: {} as Record<string, Record<string, string>> }));

vi.mock('fs/promises', () => ({
  readdir: async () => Object.keys(files.supplies),
  readFile: async (file: string) => {
    const [supply, name] = file.split('/').slice(-2);
    const value = files.supplies[supply]?.[name];
    if (value === undefined) throw new Error('ENOENT');
    return `${value}\n`;
  },
}));

describe('readLinuxOnBattery', () => {
  const battery = (status: string) => ({ type: 'Battery', scope: 'System', status });
  const mains = (online: string) => ({ type: 'Mains', online });

  beforeEach(() => {
    files.supplies = {};
  });

  it('is on battery when no mains is online and the battery discharges', async () => {
    files.supplies = { AC0: mains('0'), BAT0: battery('Discharging') };

    expect(await readLinuxOnBattery()).toBe(true);
  });

  it.each([
    ['the mains is online', { AC0: mains('1'), BAT0: battery('Discharging') }],
    ['the battery is not charging', { AC0: mains('0'), BAT0: battery('Not charging') }],
    ['there is no battery, as on a desktop', { AC0: mains('0') }],
    ['only a device discharges, as a mouse', { AC0: mains('1'), hidpp: { type: 'Battery', scope: 'Device', status: 'Discharging' } }],
    ['there are no supplies', {}],
  ])('is not on battery when %s', async (_name, supplies) => {
    files.supplies = supplies;

    expect(await readLinuxOnBattery()).toBe(false);
  });

  it('does not count a device battery that discharges while the computer charges', async () => {
    files.supplies = { AC0: mains('1'), BAT0: battery('Charging'), hidpp: { type: 'Battery', scope: 'Device', status: 'Discharging' } };

    expect(await readLinuxOnBattery()).toBe(false);
  });
});
