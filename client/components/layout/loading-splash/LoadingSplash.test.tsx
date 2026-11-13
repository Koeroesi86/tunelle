import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadingSplash from './LoadingSplash';

// the preload script fills these elements by id while the app starts (see electron/preload.ts), the ids are the contract
describe('LoadingSplash', () => {
  const html = renderToStaticMarkup(<LoadingSplash />);
  const page = new DOMParser().parseFromString(html, 'text/html');

  it('covers the window, and leaves the text to the main process, which sends it in the language of the user', () => {
    expect(page.getElementById('splash')?.style.position).toBe('fixed');
    expect(page.getElementById('splash-status')?.textContent).toBe('');
  });

  it('shows the wordmark of the app under the animated logo, which is in the page and not a file to fetch', () => {
    expect(page.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(page.querySelector('svg[aria-label="Tunelle"]')).toBeTruthy();
  });

  it('has two buttons for the question on a metered connection, hidden until it is asked', () => {
    expect(page.getElementById('splash-actions')?.style.display).toBe('none');
    expect(page.querySelectorAll('#splash-actions button')).toHaveLength(2);
  });

  it('has a progress bar for the download that stays hidden until there is progress', () => {
    expect(page.getElementById('splash-progress-track')?.hasAttribute('hidden')).toBe(true);
    expect(page.getElementById('splash-progress-bar')?.style.width).toBe('0%');
  });
});
