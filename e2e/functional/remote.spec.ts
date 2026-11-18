import type { Page } from '@playwright/test';
import { expect, navigate, test, ui } from '../support/app';
import { expectSilence, expectTone } from '../support/audio';
import { player } from '../support/player';

// two apps on one machine: the host (`session`, with the library) and the listener (`second`, empty). No mDNS: the address is typed
const pair = async (host: Page, listener: Page) => {
  await navigate(host, 'Settings');
  await host.getByRole('switch', { name: ui('Remote listening') }).click();
  const port = await host
    .getByText(/^Other devices connect to the port \d+/)
    .textContent()
    .then((text) => text?.match(/\d+/)?.[0] ?? '');
  expect(port).not.toBe('');

  await navigate(listener, 'Settings');
  await listener.getByRole('textbox', { name: ui('Address'), exact: true }).fill('127.0.0.1');
  await listener.getByRole('textbox', { name: ui('Port'), exact: true }).fill(port);
  await listener.getByRole('button', { name: ui('Connect'), exact: true }).click();
  await listener.getByRole('button', { name: ui('The codes match, ask to listen') }).click();

  // each step on its own, so a failure names the one that did not happen: the listener waits, the host shows the request, then the click
  await expect(listener.getByText(/^Waiting for 127\.0\.0\.1:\d+ to approve this device/)).toBeVisible();
  // the request is asked on whatever page is open, in the dialog with the code; the dialog is always in the page, off screen while it has no message
  const dialog = host.locator('[class*="Confirm__confirm"]').filter({ hasText: 'asks to listen to Tunelle' });
  await expect(dialog).toBeInViewport();
  await dialog.getByRole('button', { name: ui('Approve'), exact: true }).click();
  // the settings hint and the follow chip of the player bar show the same text, so the hint is picked by its place
  await expect(listener.locator('[class*="RemoteListener__hint"]').getByText(`Listening to 127.0.0.1:${port}`)).toBeVisible();
  return port;
};

const listenAlong = async (host: Page, listener: Page) => {
  await pair(host, listener);
  await player(host).playAlbum('Pitch Perfect');
  await expectTone(host, 440);
  await listener.getByRole('button', { name: ui('Listen along') }).click();
  await expectTone(listener, 440);
};

test('a second app listens along to what the host plays after the host approved it', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);
});

test('the listener is silent while the host pauses, and hears the tone again when the host plays', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);

  await player(host.page).pause();
  await expectSilence(listener.page);

  await player(host.page).play();
  await expectTone(listener.page, 440);
});

test('the listener follows the host to the next track', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);

  await player(host.page).next();

  await expectTone(host.page, 880);
  await expectTone(listener.page, 880);
});

test('the listener moves to where the host seeks to', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);

  await player(host.page).seekTo(2);

  await expect.poll(async () => Math.abs((await player(listener.page).currentTime()) - (await player(host.page).currentTime()))).toBeLessThan(1.5);
});

test('the listener loses the audio when the host revokes it', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);

  await navigate(host.page, 'Settings');
  await host.page.getByRole('button', { name: ui('Revoke'), exact: true }).click();

  await expectSilence(listener.page);
  await expect(listener.page.getByText(ui('The host does not know this device any more. Ask again.'))).toBeVisible();
  await expectTone(host.page, 440);
});

test('the listener skips the host to the next track once the host granted it', async ({ session: host, second: listener }) => {
  await listenAlong(host.page, listener.page);
  await navigate(host.page, 'Settings');
  await host.page
    .getByRole('group', { name: /^What .* may control$/ })
    .getByRole('checkbox', { name: ui('Skip') })
    .check();

  await navigate(listener.page, 'Settings');
  await listener.page
    .getByRole('group', { name: ui('Controls of the host') })
    .getByRole('button', { name: ui('Next') })
    .click();

  await expectTone(host.page, 880);
  await expectTone(listener.page, 880);
});
