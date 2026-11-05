import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const componentsPath = resolve(__dirname, '..');

const stylesheets = readdirSync(componentsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'theme-provider')
  .flatMap((entry) =>
    readdirSync(join(componentsPath, entry.name))
      .filter((file) => file.endsWith('.scss'))
      .map((file) => join(entry.name, file))
  );

// a hex colour, a colour function or a named colour used as a value
const colour = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)\(|:\s*(?:white|black|red|green|blue|gray|grey)\b/i;

describe('component stylesheets', () => {
  it('are found', () => {
    expect(stylesheets.length).toBeGreaterThan(10);
  });

  it.each(stylesheets)('%s has no colour of its own, it uses the custom properties of the theme', (stylesheet) => {
    const lines = readFileSync(join(componentsPath, stylesheet), 'utf8')
      .split('\n')
      .filter((line) => colour.test(line));

    expect(lines).toEqual([]);
  });
});
