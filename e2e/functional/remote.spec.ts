import { expect, navigate, test, ui } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// two apps on one machine: the host (`session`, with the library) and the listener (`second`, empty). No mDNS: the address is typed
test('a second app listens along to what the host plays after the host approved it', async ({ session: host, second: listener }) => {
  await navigate(host.page, 'Settings');
  await host.page.getByRole('switch', { name: ui('Remote listening') }).click();
  const port = await host.page
    .getByText(/^Other devices connect to the port \d+/)
    .textContent()
    .then((text) => text?.match(/\d+/)?.[0] ?? '');
  expect(port).not.toBe('');

  await navigate(listener.page, 'Settings');
  await listener.page.getByRole('textbox', { name: ui('Address'), exact: true }).fill('127.0.0.1');
  await listener.page.getByRole('textbox', { name: ui('Port'), exact: true }).fill(port);
  await listener.page.getByRole('button', { name: ui('Connect'), exact: true }).click();
  await listener.page.getByRole('button', { name: ui('The codes match, ask to listen') }).click();

  // each step on its own, so a failure names the one that did not happen: the listener waits, the host shows the request, then the click
  await expect(listener.page.getByText(/^Waiting for 127\.0\.0\.1:\d+ to approve this device/)).toBeVisible();
  // the request is asked on whatever page is open, in the dialog with the code; the dialog is always in the page, off screen while it has no message
  const dialog = host.page.locator('[class*="Confirm__confirm"]').filter({ hasText: 'asks to listen to Tunelle' });
  await expect(dialog).toBeInViewport();
  await dialog.getByRole('button', { name: ui('Approve'), exact: true }).click();
  await expect(listener.page.getByText(`Listening to 127.0.0.1:${port}`)).toBeVisible();

  await player(host.page).playAlbum('Pitch Perfect');
  await expectTone(host.page, 440);

  await listener.page.getByRole('button', { name: ui('Listen along') }).click();
  await expectTone(listener.page, 440);
});
