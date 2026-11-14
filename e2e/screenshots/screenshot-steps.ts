import { test as base, expect, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { z } from 'zod';
import { join, resolve } from 'path';
import { albums, startDirectory, writeLibrary } from '../../scripts/screenshots/screenshot-fixtures';
import { installActiveAudio } from '../support/active-audio';
import { installAudioProbe } from '../support/audio-probe';
import { addFolder, launchApp, navigate, ui } from '../support/app';

// what the screenshots share: the app on a library of generated files with an album playing, and the steps and the picture taken from it
// (scenes.spec.ts for the pictures of the website, small-windows.spec.ts for the layout at small sizes)
// SCREENSHOTS_OUT=folder writes the pictures there instead of the default folder of the file that takes them, SCREENSHOTS_THEME=light starts the app in the light theme

const output = resolve(__dirname, '../..', process.env.SCREENSHOTS_OUT ?? 'site/screenshots');

// the window blur is off in a clean profile, so the window has the solid background of the theme and nothing of the desktop shows
const theme = z.enum(['dark', 'light']).catch('dark').parse(process.env.SCREENSHOTS_THEME);

export interface Album {
  title: string;
  tracks: string[];
}

// the window of the app is shared by the tests of the file, which is why it is not the page fixture of Playwright
type Resize = (width: number, height: number) => Promise<void>;

export const screenshotTest = base.extend<object, { session: { page: Page; resize: Resize }; window: Page; resize: Resize }>({
  session: [
    async ({}, use) => {
      const home = mkdtempSync(join(tmpdir(), 'tunelle-screenshots-'));
      const music = join(home, 'music');
      writeLibrary(music);
      const directory = await startDirectory();
      const { app, page } = await launchApp({ home, radioDirectory: directory.origin, initScripts: [installActiveAudio, installAudioProbe] });
      // the app stops what moves on its own for this setting (the wave of a station is drawn once, the covers change at once), so a picture does not depend on the moment it is taken
      // and the app starts in the colour scheme of SCREENSHOTS_THEME (dark unless it says light), as the mode of a clean profile follows the system
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await addFolder(
        page,
        music,
        albums.reduce((sum: number, album: Album) => sum + album.tracks.length, 0)
      );
      // what every scene starts from: an album playing
      await playAlbum(page, albums[0]);
      const resize = async (width: number, height: number) => {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().forEach((window) => window.setContentSize(size.width, size.height)), {
          width,
          height,
        });
        await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
      };
      await use({ page, resize });
      await app.close().catch(() => undefined);
      directory.close();
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
    { scope: 'worker' },
  ],
  window: [async ({ session }, use) => use(session.page), { scope: 'worker' }],
  resize: [async ({ session }, use) => use(session.resize), { scope: 'worker' }],
});

export const visible = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first();

export const currentTime = (page: Page) => page.evaluate(() => window.activeAudio?.()?.currentTime ?? 0);

// the page of an album is there only while an album is open, its back button is the one that can be seen
export const closeDialog = (page: Page) => page.locator('[class*="AlbumDetails__close"]').filter({ visible: true }).click();

// plays a whole album from its page: the page has its tracks before the button is pressed, the first track runs before it is left again
export const playAlbum = async (page: Page, { title, tracks }: Album) => {
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

export const shown = (page: Page, text: string | RegExp) => expect(page.locator('body')).toContainText(text);

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
export const capture = async (page: Page, name: string, folder = output) => {
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
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.webp`), Buffer.from(latest, 'base64'));
  await session.detach();
};

// the clock of the page follows the audio element: at a rate of zero it stays where it is while the element keeps playing
export const holdAt = (page: Page, seconds: number) =>
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
