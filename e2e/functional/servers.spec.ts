import type { Locator } from '@playwright/test';
import { expect, navigate, test } from '../support/app';
import { clearProbe, expectSilence, expectTone } from '../support/audio';
import { player } from '../support/player';
import { startSubsonic } from '../support/subsonic-server';

// the pages of the other kinds of server stay mounted, hidden
const shown = (locator: Locator) => locator.filter({ visible: true });

// the other kinds of server differ in their calls only, which electron/services/sources/media-servers.integration.test.ts tries
test('adds a Subsonic server and plays an album of it, which goes on with the track it holds when the server goes away', async ({ start }) => {
  const server = await startSubsonic();
  const { page } = await start();
  const controls = player(page);

  await navigate(page, 'Online');
  await navigate(page, 'Subsonic');
  await page.getByTitle('Subsonic servers', { exact: true }).click();
  await shown(page.getByLabel('Name', { exact: true })).fill('Attic');
  await shown(page.getByLabel('Address', { exact: true })).fill(server.url);
  await shown(page.getByLabel('User name', { exact: true })).fill('me');
  await shown(page.getByLabel('Password', { exact: true })).fill('sesame');
  await shown(page.locator('form').getByRole('button', { name: 'Add', exact: true })).click();
  await page.getByTitle('Subsonic: Albums', { exact: true }).click();
  await shown(page.getByRole('button', { name: 'Play Far Away' })).click();
  await shown(page.getByRole('button', { name: 'Select All', exact: true })).click();
  await shown(page.getByRole('button', { name: 'Play selected', exact: true })).click();

  await expect(controls.title()).toHaveText('Remote A');
  await expectTone(page, 440);

  server.takeAway();

  // the track was downloaded whole, so it plays and seeks without the server
  await controls.seekTo(10);
  await clearProbe(page);
  await expectTone(page, 440);
  await controls.skipToEnd();

  // a track of a server is not loaded early: the next one fails, and the queue ends there
  await expect(controls.title()).toHaveText('Remote Octave');
  await controls.expectPaused();
  await clearProbe(page);
  await expectSilence(page);
});
