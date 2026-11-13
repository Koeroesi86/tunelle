import { resolve } from 'path';
import type { Page } from '@playwright/test';
import { albums } from '../../scripts/screenshots/screenshot-fixtures';
import { expect, ui } from '../support/app';
import { capture, closeDialog, currentTime, holdAt, shown, screenshotTest as test, visible } from './screenshot-steps';

// the layout at the sizes of docs/development/responsive-layout.md (npm run screenshots -- small-windows): every page at a compact, a medium, an expanded and an ultrawide window
// is taken, and checked on the way (nothing sticks out of the window, the play and next buttons are on top where they are), then the window turns from landscape to portrait and back
// with a list scrolled and a dialog open. It is not in the e2e project, so CI does not run it: the pictures go to .cache/responsive-layout (SCREENSHOTS_OUT writes elsewhere)
// and a person looks at them. See docs/development/responsive-layout.md

const folder = resolve(__dirname, '../..', process.env.SCREENSHOTS_OUT ?? '.cache/responsive-layout');

const sizes = [
  { name: 'compact', width: 390, height: 844 },
  { name: 'medium', width: 800, height: 600 },
  { name: 'expanded', width: 1360, height: 850 },
  { name: 'ultrawide', width: 2560, height: 1080 },
] as const;

const pages = ['Home', 'Now playing', 'Radio stations', 'Liked', 'Equalizer', 'Settings', 'Albums', 'Songs'] as const;

test.describe.configure({ mode: 'serial' });

// the clock of the player is held, or every picture shows another second
test.beforeAll(async ({ window: page }) => holdAt(page, 16));

// the compact window has its navigation in a drawer, which the menu button opens
const openNavigation = async (page: Page) => {
  const menu = page.getByRole('button', { name: ui('Menu') });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') await menu.click();
};

const item = (page: Page, label: string) => page.locator(`[class*="Navigation__item"][title="${ui(label)}"]`).filter({ visible: true });

const go = async (page: Page, label: (typeof pages)[number]) => {
  await openNavigation(page);
  // the drawer slides in: what is in it is counted when it is there
  await expect(item(page, 'Settings')).toBeVisible();
  if (label === 'Albums' || label === 'Songs') {
    // the group of the library opens on a click and closes on the next
    if (!(await item(page, label).count())) await item(page, 'Library').click();
    await expect(item(page, label)).toBeVisible();
  }
  await item(page, label).click();
};

// the elements that are drawn past the right or the bottom edge of the window and are not in a box that scrolls: what the person cannot reach
const outside = (page: Page) =>
  page.evaluate(() => {
    const { innerWidth: width, innerHeight: height } = window;
    // a box that is as wide as the window clips by the window, so it is no excuse for what sticks out of it
    const clips = (element: Element) => {
      const { overflowX, overflowY } = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (overflowX !== 'visible' || overflowY !== 'visible') && box.width < width - 1 && box.height < height - 1;
    };
    return Array.from(document.body.querySelectorAll('*'))
      .filter((element) => element.checkVisibility({ visibilityProperty: true, opacityProperty: false, contentVisibilityAuto: true }))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.right > width + 1 || box.left < -1);
      })
      .filter((element) => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) if (clips(parent)) return false;
        return getComputedStyle(element).position !== 'fixed' || element.getBoundingClientRect().left < width;
      })
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`)
      .slice(0, 5);
  });

// what keeps a button from being used, or nothing: it is on the window, and a click at its middle reaches it (the same label can be on a page that is not shown)
const blockedBy = (page: Page, title: string) =>
  page.evaluate((name) => {
    const reasons = Array.from(document.querySelectorAll<HTMLElement>(`button[title="${name}"], button[aria-label="${name}"]`)).map((button) => {
      const box = button.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const inside = box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight;
      if (inside && top && button.contains(top)) return '';
      return inside
        ? `covered by ${top?.tagName}.${String(top?.className)}`
        : `outside the window at ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`;
    });
    return reasons.includes('') ? '' : `${name}: ${reasons.join('; ') || 'not on the page'}`;
  }, title);

// polled, as a dialog that was closed a moment ago, or a drawer, is still on its way out
const expectUsable = async (page: Page) => {
  await expect.poll(() => outside(page)).toEqual([]);
  await expect.poll(async () => [await blockedBy(page, ui('Pause')), await blockedBy(page, ui('Play'))]).toContain('');
  await expect.poll(() => blockedBy(page, ui('Next'))).toBe('');
};

for (const { name, width, height } of sizes) {
  test.describe(name, () => {
    test.beforeAll(async ({ resize }) => resize(width, height));

    for (const label of pages) {
      test(label, async ({ window: page }) => {
        await go(page, label);
        await shown(page, ui(label === 'Albums' || label === 'Songs' ? 'Library' : label));
        await expectUsable(page);
        await capture(page, `${name}-${label.toLowerCase().replace(/ /g, '-')}`, folder);
      });
    }

    test('album dialog', async ({ window: page }) => {
      await go(page, 'Albums');
      await visible(page, albums[1].title).click();
      await expect(visible(page, albums[1].tracks.at(-1) ?? '')).toBeVisible();
      // the dialog covers the player bar: it has to fit the window, and the way out of it is on the window
      expect(await outside(page)).toEqual([]);
      expect(await blockedBy(page, ui('Close'))).toBe('');
      await capture(page, `${name}-album-dialog`, folder);
      await closeDialog(page);
    });
  });
}

test.describe('turning the window', () => {
  const landscape = { width: 900, height: 520 };
  // still low enough for the list of the test to scroll: a window that shows all of it has nothing to keep
  const portrait = { width: 520, height: 640 };

  test.beforeAll(async ({ resize }) => resize(landscape.width, landscape.height));

  test('keeps the scroll position of a list, and nothing sticks out', async ({ window: page, resize }) => {
    await go(page, 'Songs');
    await shown(page, ui('20 tracks'));
    // the box of the list that scrolls: the visible one that is taller than it shows, outside the navigation, which scrolls on its own; it is scrolled a little
    const scroller = await page.evaluateHandle(() => {
      const found = Array.from(document.body.querySelectorAll('*')).find(
        (element) =>
          element.checkVisibility() &&
          !element.closest('[class*="Navigation__"]') &&
          getComputedStyle(element).overflowY === 'auto' &&
          element.scrollHeight > element.clientHeight + 40
      );
      if (found) found.scrollTop = 40;
      return found;
    });
    const before = await scroller.evaluate((element) => element?.scrollTop ?? 0);
    expect(before).toBeGreaterThan(0);

    await resize(portrait.width, portrait.height);
    expect(await scroller.evaluate((element) => element?.scrollTop)).toBe(before);
    await expectUsable(page);

    await resize(landscape.width, landscape.height);
    expect(await scroller.evaluate((element) => element?.scrollTop)).toBe(before);
    await expectUsable(page);
  });

  test('keeps a dialog open, and the track playing', async ({ window: page, resize }) => {
    await go(page, 'Albums');
    await visible(page, albums[1].title).click();
    await expect(visible(page, albums[1].tracks.at(-1) ?? '')).toBeVisible();
    const close = page.locator('[class*="AlbumDetails__close"]').filter({ visible: true });
    // the clock runs again, to see that turning the window did not stop the track
    await page.evaluate(() => {
      const audio = window.activeAudio?.();
      if (audio) audio.playbackRate = 1;
    });
    const played = await currentTime(page);

    await resize(portrait.width, portrait.height);
    await expect(close).toBeVisible();
    expect(await outside(page)).toEqual([]);
    await capture(page, 'turned-album-dialog-portrait', folder);

    await resize(360, 480);
    await expect(close).toBeVisible();

    await resize(landscape.width, landscape.height);
    await expect(close).toBeVisible();
    await expect.poll(() => currentTime(page)).toBeGreaterThan(played);
    await closeDialog(page);
  });

  test.afterAll(async ({ resize }) => resize(1360, 850));
});
