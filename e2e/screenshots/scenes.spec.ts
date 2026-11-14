import { type Page } from '@playwright/test';
import { expect, navigate, ui } from '../support/app';
import { albums } from '../../scripts/screenshots/screenshot-fixtures';
import { capture, closeDialog, currentTime, holdAt, playAlbum, shown, screenshotTest as test, visible, type Album } from './screenshot-steps';

// the pictures of site/screenshots (npm run screenshots [-- -g scene]), one test each, in the order of the list: a scene starts from an album playing, and from what the ones before left
// the same pictures every time: a library of generated tagged files and a made up station directory (scripts/screenshots/screenshot-fixtures.ts), a clean profile, English (SCREENSHOTS_LANG=hu for another language of shared/locales/), reduced motion, 1360 x 850,
// and the clock of the player held where the scene wants it; Linux draws headless, Windows and macOS need their desktop
// SCREENSHOTS_OUT=folder writes the pictures there instead of site/screenshots, SCREENSHOTS_THEME=light starts the app light instead of dark, SCREENSHOTS_LANG=hu takes them in Hungarian (the texts of the steps are English, ui() finds them in the language of the run)

test.describe.configure({ mode: 'serial' });

const clock = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);

// a station has no position to seek to: the clock is held when it has run that long
const holdWhenRun = async (page: Page, seconds: number) => {
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(seconds);
  await page.evaluate(() => {
    const audio = window.activeAudio?.();
    if (audio) audio.playbackRate = 0;
  });
};

// the folder of the library is in a folder of the run that has a random name, which a picture would show: it reads as a folder of a home
const hidePaths = (page: Page) =>
  page.evaluate(() => {
    const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode())
      node.textContent = (node.textContent ?? '').replace(/\S*tunelle-screenshots-\w+[\\/]?/, '/home/mia/');
  });

// the heart in the row or tile that says the text: the nearest parent with a heart of its own
const like = (page: Page, text: string) =>
  page.evaluate(
    ({ label, heart }) => {
      let element =
        Array.from(document.body.querySelectorAll('*')).find((candidate) => !candidate.children.length && candidate.textContent?.trim() === label) ?? null;
      while (element && element.querySelectorAll(heart).length !== 1) element = element.parentElement;
      element?.querySelector<HTMLElement>(heart)?.click();
    },
    { label: text, heart: `[aria-label="${ui('Add to favourites')}"]` }
  );

// a playlist of the albums, built through the page of each album: the menu opens at the end of the document
const playlist = async (page: Page, name: string, listed: Album[]) => {
  await page.getByRole('button', { name: ui('New playlist') }).click();
  await page.getByLabel(ui('Playlist name')).first().fill(name);
  await page.getByLabel(ui('Playlist name')).first().press('Enter');
  await expect(visible(page, name)).toBeVisible();
  for (const { title, tracks } of listed) {
    await navigate(page, 'Albums');
    await visible(page, title).click();
    await expect(visible(page, tracks.at(-1) ?? '')).toBeVisible();
    await page
      .locator('[class*="AlbumDetails__albumDetails"]')
      .getByRole('button', { name: ui('Add to a playlist') })
      .click();
    await page.getByRole('menuitem', { name }).last().click();
    await closeDialog(page);
  }
};

test('songs', async ({ window: page }) => {
  await navigate(page, 'Songs');
  await shown(page, ui('20 tracks'));
  await holdAt(page, 16);
  await shown(page, clock(16));
  await capture(page, 'songs');
});

test('now', async ({ window: page }) => {
  await navigate(page, 'Now playing');
  await shown(page, new RegExp(ui('Up next'), 'i'));
  await holdAt(page, 22);
  await shown(page, clock(22));
  await capture(page, 'now');
});

test('album', async ({ window: page }) => {
  await navigate(page, 'Albums');
  await visible(page, albums[4].title).click();
  await expect(visible(page, albums[4].tracks.at(-1) ?? '')).toBeVisible();
  await holdAt(page, 97);
  await shown(page, clock(97));
  await capture(page, 'album');
});

test('radio', async ({ window: page }) => {
  // the page of the album before may still be open
  const open = page.locator('[class*="AlbumDetails__close"]').filter({ visible: true });
  if (await open.count()) await open.click();
  // two more albums played, so the history of Home has more than one row
  await playAlbum(page, albums[1]);
  await playAlbum(page, albums[3]);
  await navigate(page, 'Radio stations');
  await expect(visible(page, 'Night Owl FM')).toBeVisible();
  await page.locator('.RadioStations__station').filter({ hasText: 'Night Owl FM' }).locator('.RadioStations__playButton').click();
  await expect.poll(() => page.evaluate(() => window.activeAudio?.()?.src.includes('/radio/'))).toBe(true);
  await holdWhenRun(page, 12);
  await shown(page, clock(12));
  await capture(page, 'radio');
});

test('albums', async ({ window: page }) => {
  await navigate(page, 'Albums');
  await expect(visible(page, albums[4].title)).toBeVisible();
  await capture(page, 'albums');
});

test('genre', async ({ window: page }) => {
  await navigate(page, 'Genres');
  await expect(visible(page, 'Indie')).toBeVisible();
  await visible(page, 'Indie').click();
  await shown(page, ui('Play all'));
  await capture(page, 'genre');
});

test('folders', async ({ window: page }) => {
  await navigate(page, 'Folders');
  await shown(page, ui('Drop music folders here'));
  await hidePaths(page);
  await capture(page, 'folders');
});

test('liked', async ({ window: page }) => {
  await navigate(page, 'Albums');
  await expect(visible(page, albums[0].title)).toBeVisible();
  await like(page, albums[0].title);
  await like(page, albums[2].title);
  await like(page, albums[4].title);
  await navigate(page, 'Songs');
  await shown(page, ui('20 tracks'));
  await like(page, albums[1].tracks[0]);
  await like(page, albums[3].tracks[2]);
  await navigate(page, 'Radio stations');
  await expect(visible(page, 'Night Owl FM')).toBeVisible();
  await like(page, 'Night Owl FM');
  await like(page, 'Juniper Classical');
  await like(page, 'Harbour Jazz');
  await navigate(page, 'Liked');
  await shown(page, 'Night Owl FM');
  await capture(page, 'liked');
});

test('playlist', async ({ window: page }) => {
  await playlist(page, 'Late night', [albums[0], albums[4]]);
  await visible(page, 'Late night').click();
  await shown(page, 'Aurora Drift');
  await capture(page, 'playlist');
});

test('equalizer', async ({ window: page }) => {
  await navigate(page, 'Equalizer');
  await shown(page, ui('Drag a dot, or use the up and down arrows on a focused one'));
  await page.getByRole('button', { name: ui('Bass boost') }).click();
  await capture(page, 'equalizer');
});

test('home', async ({ window: page }) => {
  await navigate(page, 'Home');
  await shown(page, new RegExp(ui('Recently played'), 'i'));
  await capture(page, 'home');
});

test('settings', async ({ window: page }) => {
  await navigate(page, 'Settings');
  await shown(page, ui('Accent colour'));
  // the version and the update line of a development run are not what the picture is about
  await page.locator('[class*="About__about"]').evaluate((about) => about instanceof HTMLElement && (about.style.display = 'none'));
  await hidePaths(page);
  await capture(page, 'settings');
});

test('light', async ({ window: page }) => {
  await visible(page, ui('Light')).click();
  await navigate(page, 'Albums');
  await expect(visible(page, albums[4].title)).toBeVisible();
  await capture(page, 'light');
});
