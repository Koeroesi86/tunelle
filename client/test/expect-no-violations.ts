import { expect } from 'vitest';
import { axe } from 'vitest-axe';

/** Fails with the rule and the nodes of every violation axe finds in the element; jsdom has no layout, so the checks that need one (colour contrast) are left to the `a11y` project. See docs/development/accessibility.md */
export const expectNoViolations = async (element: Element) => {
  const { violations } = await axe(element);

  expect(violations.map(({ id, help, nodes }) => ({ id, help, nodes: nodes.map(({ html }) => html) }))).toEqual([]);
};
