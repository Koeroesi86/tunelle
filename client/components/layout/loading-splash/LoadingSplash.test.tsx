import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadingSplash from './LoadingSplash';

// the main process fills these elements by id while it checks for updates (see splash-preload.ts), the ids are the contract
describe('LoadingSplash', () => {
  const html = renderToStaticMarkup(<LoadingSplash locals={{ title: 'Tunelle' }} />);
  const page = new DOMParser().parseFromString(html, 'text/html');

  it('has the title and leaves the text to the main process, which sends it in the language of the user', () => {
    expect(page.title).toBe('Tunelle');
    expect(page.getElementById('status')?.textContent).toBe('');
  });

  it('shows the wordmark of the app under the animated logo', () => {
    expect(page.querySelector('img')).toBeTruthy();
    expect(page.querySelector('svg[aria-label="Tunelle"]')).toBeTruthy();
  });

  it('has two buttons for the question on a metered connection, hidden until it is asked', () => {
    expect(page.getElementById('actions')?.hasAttribute('hidden')).toBe(true);
    expect(page.querySelectorAll('#actions button')).toHaveLength(2);
  });

  it('has a progress bar for the download that stays hidden until there is progress', () => {
    expect(page.getElementById('progress-track')?.hasAttribute('hidden')).toBe(true);
    expect(page.getElementById('progress-bar')?.style.width).toBe('0%');
  });
});
