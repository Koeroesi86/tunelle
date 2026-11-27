import { expect, navigate, test as base } from '../support/app';
import { expectSilence, expectTone } from '../support/audio';
import { player } from '../support/player';
import { startToneStations } from '../support/radio-station';

const test = base.extend<{ stations: Awaited<ReturnType<typeof startToneStations>> }>({
  stations: async ({}, use) => {
    const stations = await startToneStations([440, 880]);
    await use(stations);
    stations.close();
  },
  // the app is pointed to these stations in place of the silent ones
  directory: async ({ stations }, use) => use(stations),
});

const failures = [
  { name: 'drops', fail: 'drop' },
  // the player waits 15 s for a stream that is silent before it asks again
  { name: 'goes silent', fail: 'stall' },
] as const;

failures.forEach(({ name, fail }) =>
  test(`asks a station that ${name} again and plays on`, async ({ start, stations }) => {
    const { page } = await start();
    const controls = player(page);
    await navigate(page, 'Radio stations');
    await page.getByText('Night Owl FM').dblclick();
    await expectTone(page, 440);

    stations[fail]();

    await expectSilence(page);
    await expect(async () => expectTone(page, 880)).toPass({ timeout: 45_000 });
    await controls.expectPlaying();
  })
);
