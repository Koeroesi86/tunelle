import { test as base, expect, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { albums, startDirectory, writeLibrary } from '../../scripts/screenshot-fixtures';
import { installActiveAudio } from '../active-audio';
import { installAudioProbe } from '../audio-probe';
import { addFolder, launchApp, navigate, ui } from '../app';

// the pictures of site/screenshots (npm run screenshots [-- -g scene]), one test each, in the order of the list: a scene starts from an album playing, and from what the ones before left
// the same pictures every time: a library of generated tagged files and a made up station directory (scripts/screenshot-fixtures.js), a clean profile, English (SCREENSHOTS_LANG=hu for another language of locales/), reduced motion, 1360 x 850,
// and the clock of the player held where the scene wants it; Linux draws headless, Windows and macOS need their desktop
// SCREENSHOTS_OUT=folder writes the pictures there instead of site/screenshots, SCREENSHOTS_LANG=hu takes them in Hungarian (the texts of the steps are English, ui() finds them in the language of the run)

const output = resolve(__dirname, '../..', process.env.SCREENSHOTS_OUT ?? 'site/screenshots');

interface Album {
  title: string;
  tracks: string[];
}

// the window of the app is shared by the tests of the file, which is why it is not the page fixture of Playwright
const test = base.extend<object, { window: Page }>({
  window: [
    async ({}, use) => {
      const home = mkdtempSync(join(tmpdir(), 'tunelle-screenshots-'));
      const music = join(home, 'music');
      writeLibrary(music);
      const directory = await startDirectory();
      const { app, page } = await launchApp({ home, radioDirectory: directory.origin, initScripts: [installActiveAudio, installAudioProbe] });
      // the app stops what moves on its own for this setting (the wave of a station is drawn once, the covers change at once), so a picture does not depend on the moment it is taken
      // and the colour scheme is the one of the system, not the light one that Playwright sets unless it is told not to
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: null });
      // the window is transparent and its panels are translucent: what is behind it is black, as on a desktop of its own
      await page.addStyleTag({ content: 'html { background: #000 !important; }' });
      await addFolder(
        page,
        music,
        albums.reduce((sum: number, album: Album) => sum + album.tracks.length, 0)
      );
      // what every scene starts from: an album playing
      await playAlbum(page, albums[0]);
      await use(page);
      await app.close().catch(() => undefined);
      directory.close();
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
    { scope: 'worker' },
  ],
});

test.describe.configure({ mode: 'serial' });

const clock = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);

const visible = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first();

const currentTime = (page: Page) => page.evaluate(() => window.activeAudio?.()?.currentTime ?? 0);

// the dialog of an album is mounted all the time, its Close button is the one that can be seen
const closeDialog = (page: Page) => page.locator('[class*="AlbumDetails__close"]').filter({ visible: true }).click();

// plays a whole album from its dialog: the dialog has its tracks before the button is pressed, the first track runs before it is closed again
const playAlbum = async (page: Page, { title, tracks }: Album) => {
  await navigate(page, 'Albums');
  await visible(page, title).click();
  await expect(visible(page, tracks.at(-1) ?? '')).toBeVisible();
  // a click the page was not ready for does nothing: it is made again until the track runs
  await expect(async () => {
    await page.getByRole('button', { name: ui('Play album') }).click();
    await expect.poll(() => currentTime(page), { timeout: 3000 }).toBeGreaterThan(0.2);
  }).toPass();
  await closeDialog(page);
};

// the clock of the page follows the audio element: at a rate of zero it stays where it is while the element keeps playing
const holdAt = (page: Page, seconds: number) =>
  page.evaluate(
    (to) =>
      new Promise<void>((done) => {
        const audio = window.activeAudio?.();
        if (!audio) throw new Error('nothing plays');
        audio.addEventListener(
          'seeked',
          () => {
            audio.playbackRate = 0;
            done();
          },
          { once: true }
        );
        audio.playbackRate = 1;
        audio.currentTime = to;
      }),
    seconds
  );

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

// a playlist of the albums, built through the dialog of each: the dialog is the last of the page, so is its menu
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
      .getByRole('button', { name: ui('Add to a playlist') })
      .last()
      .click();
    await page.getByRole('menuitem', { name }).last().click();
    await closeDialog(page);
  }
};

const shown = (page: Page, text: string | RegExp) => expect(page.locator('body')).toContainText(text);

// the animations that end have run their course, and the ones that never end (a meter that plays) are set to their first frame, so the picture does not depend on the moment it is taken
const settle = (page: Page) =>
  page.evaluate(async () => {
    const animations = document.getAnimations();
    const isEndless = (animation: Animation) => animation.effect?.getComputedTiming().iterations === Infinity;
    animations.filter(isEndless).forEach((animation) => {
      animation.pause();
      animation.currentTime = 0;
    });
    await Promise.all(animations.filter((animation) => !isEndless(animation)).map((animation) => animation.finished.catch(() => undefined)));
    // a cover that faded in keeps the one it replaced under itself until the end of the fade
    for (
      let waited = 0;
      Array.from(document.querySelectorAll('[class*="CoverFade__cover"]')).some((cover) => cover.children.length > 1) && waited < 5000;
      waited += 50
    ) {
      await new Promise((done) => setTimeout(done, 50));
    }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });

// what is loaded after the steps (an image, a tint that follows a cover) is not in the first picture: it is taken again until two in a row are the same
const capture = async (page: Page, name: string) => {
  // the pointer is where the last click left it, and what is under it is drawn as hovered: it is parked on the title bar, where nothing reacts
  await page.mouse.move(0, 0);
  await settle(page);
  const session = await page.context().newCDPSession(page);
  const shoot = () => session.send('Page.captureScreenshot', { format: 'webp', quality: 92 }).then(({ data }) => data);
  let previous = '';
  let latest = '';
  await expect
    .poll(
      async () => {
        latest = await shoot();
        const same = latest === previous;
        previous = latest;
        return same;
      },
      { message: 'two pictures in a row that are the same', intervals: [100], timeout: 20_000 }
    )
    .toBe(true);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `${name}.webp`), Buffer.from(latest, 'base64'));
  await session.detach();
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
  // the dialog of the album before is still open
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
