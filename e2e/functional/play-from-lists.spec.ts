import { expect, navigate, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// the search of the library and the favourites are tried at the lower tiers; what stays here is that what is picked in their lists is heard

test('plays a track from the results of a search, and from Liked', async ({ session: { page } }) => {
  const controls = player(page);
  const rows = page.locator('[class*="TrackViewItem__trackViewItem"]:not([class*="header"])').filter({ visible: true });
  await navigate(page, 'Songs');
  const search = page.getByRole('searchbox', { name: 'Search the library' }).filter({ visible: true });

  await search.fill('Deep');
  await expect(rows).toHaveCount(1);
  await rows.dblclick();
  await expectTone(page, 100);
  await expect(controls.title()).toHaveText('Deep Bass');

  await search.fill('Octave');
  await expect(rows).toHaveText(/Octave Up/);
  await rows.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(rows.getByRole('button', { name: 'Remove from favourites' })).toBeAttached();
  await navigate(page, 'Liked');
  await page.getByRole('button', { name: 'Play all local' }).click();

  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');
});
