// Needs the real app: axe reads the colours and the layout that Chromium renders from the styles
import type { Page } from '@playwright/test';
import { expect, navigate, test, ui } from '../support/app';
import { accessibilityViolations } from '../support/accessibility';
import { albums } from '../support/library';
import { player } from '../support/player';

const shown = (page: Page, name: string) =>
  page
    .getByRole('button', { name: ui(name), exact: true })
    .filter({ visible: true })
    .first();

/** An album that is liked, played and in a playlist, so that home, Liked and the playlists have rows to look at */
const fill = async (page: Page) => {
  await navigate(page, 'Albums');
  await shown(page, 'Add to favourites').click();
  await shown(page, 'Add to a playlist').click();
  const adding = page.getByRole('dialog', { name: ui('Add to playlist') });
  await adding.getByPlaceholder(ui('Playlist name')).fill('Evening');
  await adding.getByRole('button', { name: ui('Create') }).click();
  await player(page).playAlbum(albums[0].title);
  await navigate(page, 'Home');
  await expect(page.getByRole('button', { name: ui('Clear history') })).toBeEnabled();
};

const scenes: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'home', open: fill },
  {
    name: 'liked',
    open: async (page) => {
      await fill(page);
      await navigate(page, 'Liked');
    },
  },
  {
    name: 'playlists',
    open: async (page) => {
      await fill(page);
      await navigate(page, 'Playlists');
    },
  },
  {
    name: 'a playlist',
    open: async (page) => {
      await fill(page);
      await navigate(page, 'Playlists');
      await page.locator('[class*="Navigation__label"]').getByText('Evening', { exact: true }).click();
      await expect(shown(page, 'Play all')).toBeVisible();
    },
  },
  { name: 'folders', open: (page) => navigate(page, 'Folders') },
  {
    name: 'add to playlist dialog',
    open: async (page) => {
      await navigate(page, 'Albums');
      await shown(page, 'Add to a playlist').click();
      await expect(page.getByRole('dialog', { name: ui('Add to playlist') })).toBeVisible();
    },
  },
  {
    name: 'a question dialog',
    open: async (page) => {
      await navigate(page, 'Folders');
      await shown(page, 'Remove').click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
    },
  },
  { name: 'library', open: (page) => navigate(page, 'Albums') },
  {
    name: 'album details',
    open: async (page) => {
      await navigate(page, 'Albums');
      await page.getByText(albums[1].title, { exact: true }).filter({ visible: true }).first().click();
    },
  },
  { name: 'now playing', open: (page) => navigate(page, 'Now playing') },
  { name: 'radio', open: (page) => navigate(page, 'Radio stations') },
  {
    name: 'subsonic servers',
    open: async (page) => {
      await navigate(page, 'Online');
      await navigate(page, 'Subsonic');
      await page.getByTitle('Subsonic servers', { exact: true }).click();
    },
  },
  { name: 'settings', open: (page) => navigate(page, 'Settings') },
  { name: 'equalizer', open: (page) => navigate(page, 'Equalizer') },
];

const cases = (['light', 'dark'] as const).flatMap((colorScheme) => scenes.map((scene) => ({ colorScheme, ...scene })));

for (const { colorScheme, name, open } of cases) {
  test(`${name} in ${colorScheme} mode has no serious accessibility violations`, async ({ session: { page } }) => {
    // animations that are on their way give a colour that is not the one at rest
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await open(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

test('the album tiles are one tab stop, and the arrow keys move between them', async ({ session: { page } }) => {
  await navigate(page, 'Albums');
  const stops = page.locator('[data-tile-index][tabindex="0"]');

  await expect(stops).toHaveCount(1);
  await stops.focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('[data-tile-index="1"]')).toBeFocused();
  await expect(stops).toHaveAttribute('data-tile-index', '1');
});
