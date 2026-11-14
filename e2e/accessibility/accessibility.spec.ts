import type { Page } from '@playwright/test';
import { expect, navigate, test } from '../support/app';
import { accessibilityViolations } from '../support/accessibility';
import { albums } from '../support/library';

const scenes: { name: string; open: (page: Page) => Promise<void> }[] = [
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
