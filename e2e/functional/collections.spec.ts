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

test('lists a liked album under Liked', async ({ session }) => {
  const { page } = session;
  await navigate(page, 'Albums');
  // the tabs of the other pages stay in the page, and the first button belongs to the radio stations while the tab changes
  await page.locator('[class*="PlayerTabs__active"]').getByRole('button', { name: 'Add to favourites' }).first().click();
  await navigate(page, 'Liked');
  await expect(page.getByText('Pitch Perfect').filter({ visible: true }).first()).toBeVisible();
});

test('shows what was played under Recently played, and clears it', async ({ session: { page } }) => {
  const controls = player(page);
  await controls.playAlbum('Single Note');
  await expect(controls.title()).toHaveText('Hold It');
  await controls.pause();

  await navigate(page, 'Home');
  await expect(page.getByText('Recently played')).toBeVisible();
  await expect(page.locator('[class*="HomeView__recentList"]').getByText('Hold It')).toBeVisible();

  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.locator('[class*="Confirm"]').filter({ hasText: 'Clear the list' }).getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('Nothing was played yet')).toBeVisible();
});
