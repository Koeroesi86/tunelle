import type { Page } from '@playwright/test';
import { expect, navigate, test } from './support/app';
import { checkAccessibility } from './support/accessibility';
import { albums } from './support/library';

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
  test(`${name} has no new serious accessibility violations in ${colorScheme} mode`, async ({ session: { page } }) => {
    // animations that are on their way give a colour that is not the one at rest
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await open(page);

    const { added, fixed } = await checkAccessibility(page, `${colorScheme} ${name}`);

    expect(added, 'violations that are not in e2e/accessibility-baseline.json').toEqual([]);
    expect(fixed, 'fixed, remove them from e2e/accessibility-baseline.json').toEqual([]);
  });
}
