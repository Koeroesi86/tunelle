import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerTabs from './PlayerTabs';

const slots = {
  pages: {
    home: <div>home page</div>,
    'now-playing': <div>now playing page</div>,
    overview: <div>overview page</div>,
    'online-sources': <div>online page</div>,
    favourites: <div>favourites page</div>,
    playlist: <div>playlist page</div>,
    equalizer: <div>equalizer page</div>,
  },
  renderLocal: (addFiles: (files: FileList) => void) => (
    <button type="button" onClick={() => addFiles({} as FileList)}>
      local page
    </button>
  ),
  settings: <div>settings page</div>,
  overlay: <div>album details</div>,
};

describe('PlayerTabs', () => {
  it('shows every page and marks the one of the tab as the active one', () => {
    render(<PlayerTabs tab="favourites" {...slots} />);

    expect(screen.getByText('favourites page').parentElement?.className).toContain('active');
    expect(screen.getByText('home page').parentElement?.className).not.toContain('active');
    expect(screen.getByText('settings page')).toBeTruthy();
    expect(screen.getByText('album details')).toBeTruthy();
  });

  it('gives the local page the callback for the dropped files', () => {
    const addFiles = vi.fn();
    render(<PlayerTabs tab="local" addFiles={addFiles} {...slots} />);
    screen.getByText('local page').click();

    expect(addFiles).toHaveBeenCalledTimes(1);
  });
});
