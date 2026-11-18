import { expect, navigate, quit, test } from '../support/app';
import { player } from '../support/player';

// what the listener builds up in the app; the playlist keeps one restart for the whole app, the rest of it is tried in persistence.integration.test.ts
test('keeps a playlist of an album, and plays it', async ({ start, session }) => {
  const { page } = session;
  await navigate(page, 'Albums');
  // the menu of the album creates the playlist with the album in it
  await page.getByRole('button', { name: 'Add to a playlist' }).first().click();
  await page.getByRole('menu').getByPlaceholder('Playlist name').fill('Evening');
  await page.getByRole('menu').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Evening', { exact: true }).first()).toBeVisible();
  await quit(session.app);

  const restarted = await start();
  await restarted.page.getByText('Evening', { exact: true }).first().click();
  await expect(restarted.page.locator('[class*="PlaylistView__count"]')).toHaveText('3 tracks');
  await restarted.page.getByRole('button', { name: 'Play all' }).click();
  await expect(player(restarted.page).title()).toHaveText('Concert A');
});
