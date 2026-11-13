import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const baselineFile = join(__dirname, '..', 'accessibility-baseline.json');

const readBaseline = (): string[] => JSON.parse(readFileSync(baselineFile, 'utf8'));

// legacy mode runs axe in the page itself: the default opens a second page, which Electron does not support. See docs/development/accessibility.md
/** The serious and critical violations on the page now, as `<scene> <rule>` */
const violations = async (page: Page, scene: string) => {
  const { violations: found } = await new AxeBuilder({ page }).setLegacyMode().analyze();
  return [...new Set(found.filter(({ impact }) => impact === 'serious' || impact === 'critical').map(({ id }) => `${scene} ${id}`))].sort();
};

/** Compares the violations of a scene with the baseline: a new one fails, and so does one that is fixed but still listed (`UPDATE_A11Y_BASELINE=1` rewrites the scene). See docs/development/accessibility.md */
export const checkAccessibility = async (page: Page, scene: string) => {
  const found = await violations(page, scene);
  const baseline = readBaseline();
  const accepted = baseline.filter((entry) => entry.startsWith(`${scene} `));

  if (process.env.UPDATE_A11Y_BASELINE) {
    writeFileSync(baselineFile, `${JSON.stringify([...baseline.filter((entry) => !accepted.includes(entry)), ...found].sort(), null, 2)}\n`);
    return { added: [], fixed: [] };
  }

  return { added: found.filter((entry) => !accepted.includes(entry)), fixed: accepted.filter((entry) => !found.includes(entry)) };
};
