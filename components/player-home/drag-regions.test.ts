import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

// -webkit-app-region is inherited and Chromium does not clip its rectangles to a scroll container: a no-drag on the page puts every row that is scrolled
// up under the title bar on top of its drag region, so the window can no longer be dragged by it
describe('drag regions', () => {
  it('leave html and body without an app region', () => {
    const rootBlock = read('PlayerHome.scss').match(/^html, body \{[^}]*\}/m)?.[0];

    expect(rootBlock).toBeDefined();
    expect(rootBlock).not.toContain('-webkit-app-region');
  });

  it.each([
    '../../client/styles/settings-tile.scss',
    '../player-tabs/PlayerTabs.scss',
    '../radio-stations/RadioStations.scss',
    '../favourite-button/FavouriteButton.scss',
  ])('%s does not set no-drag on content that scrolls', (stylesheet) => {
    expect(read(stylesheet)).not.toContain('no-drag');
  });
});
