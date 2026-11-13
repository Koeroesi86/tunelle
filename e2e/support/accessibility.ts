import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// legacy mode runs axe in the page itself: the default opens a second page, which Electron does not support. See docs/development/accessibility.md
/** The serious and critical violations on the page now, as `<rule>: <help>` */
export const accessibilityViolations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).setLegacyMode().analyze();
  return violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, help, nodes }) => `${id}: ${help} (${nodes.length} elements)`);
};
