import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Navigation from './Navigation';

describe('Navigation', () => {
  it.each([
    ['Home', 'home'],
    ['Now playing', 'now-playing'],
    ['Liked', 'favourites'],
    ['Equalizer', 'equalizer'],
    ['Settings', 'settings'],
  ])('selects the %s tab on click', (label, tab) => {
    const setTab = vi.fn();
    render(<Navigation setTab={setTab} />);

    fireEvent.click(screen.getByText(label));

    expect(setTab).toHaveBeenCalledWith(tab);
  });

  it.each([
    ['Radio stations', 'radio'],
    ['Nearby Tunelles', 'nearby'],
  ])('opens the %s source of the online sources', (label, view) => {
    const openOnlineView = vi.fn();
    render(<Navigation openOnlineView={openOnlineView} />);

    fireEvent.click(screen.getByText(label));

    expect(openOnlineView).toHaveBeenCalledWith(view);
  });

  it('shows the sections of the library of a kind of server that has a server, and only those it has', () => {
    render(<Navigation sourceKinds={['plex', 'subsonic']} />);

    ['Plex: Albums', 'Plex: Artists', 'Plex: Songs', 'Subsonic: Albums', 'Subsonic: Artists'].forEach((name) =>
      expect(screen.getByRole('button', { name })).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: 'Subsonic: Songs' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Jellyfin: / })).toBeNull();
  });

  it('shows no section without a server, and loads the servers when it is shown', () => {
    const loadSources = vi.fn();
    render(<Navigation loadSources={loadSources} />);

    expect(screen.queryByRole('button', { name: /: Albums/ })).toBeNull();
    expect(loadSources).toHaveBeenCalledTimes(1);
  });

  it('opens a section and marks it as the page', () => {
    const openOnlineView = vi.fn();
    render(<Navigation sourceKinds={['plex']} tab="online-sources" onlineView="plex:artists" openOnlineView={openOnlineView} />);

    fireEvent.click(screen.getByRole('button', { name: 'Plex: Albums' }));

    expect(openOnlineView).toHaveBeenCalledWith('plex:albums');
    expect(screen.getByRole('button', { name: 'Plex: Artists' }).getAttribute('aria-current')).toBe('page');
  });

  it('marks the source that is shown, and only that one', () => {
    render(<Navigation tab="online-sources" onlineView="nearby" />);

    const active = Array.from(document.querySelectorAll('.active')).map((item) => item.textContent);
    expect(active).toEqual(['Nearby Tunelles']);
  });

  it('marks only the current tab as active', () => {
    render(<Navigation tab="equalizer" />);

    const active = Array.from(document.querySelectorAll('.active')).map((item) => item.textContent);
    expect(active).toEqual(['Equalizer']);
  });

  it('has real buttons, with aria-current on the current one only', () => {
    render(<Navigation tab="equalizer" libraryOpen view="tracks" />);

    expect(screen.getByRole('button', { name: 'Equalizer' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Home' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('button', { name: 'Library' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('defaults to the home screen', () => {
    render(<Navigation />);

    expect(document.querySelector('.active')?.textContent).toBe('Home');
  });

  it('puts the spectrum in a strip of its own between the playlists and the footer', () => {
    render(<Navigation spectrum={<canvas aria-label="Spectrum" />} />);

    const strip = screen.getByLabelText('Spectrum').parentElement;
    expect(strip?.className).toContain('spectrum');
    expect(strip?.previousElementSibling?.className).toContain('playlists');
    expect(strip?.nextElementSibling?.className).toContain('footer');
  });

  it('has no strip without a spectrum', () => {
    render(<Navigation />);

    expect(document.querySelector('.spectrum')).toBeNull();
  });

  it('keeps the equalizer and the settings in a footer of their own', () => {
    render(<Navigation />);

    expect(Array.from(document.querySelectorAll('.footer .item')).map((item) => item.textContent)).toEqual(['Equalizer', 'Settings']);
  });

  describe('online', () => {
    it('lists the sources as children of the group, and none while it is closed', () => {
      const { rerender } = render(<Navigation onlineOpen />);

      expect(Array.from(document.querySelectorAll('.child')).map((item) => item.textContent)).toEqual(
        expect.arrayContaining(['Radio stations', 'Nearby Tunelles'])
      );

      rerender(<Navigation onlineOpen={false} />);

      expect(screen.queryByText('Nearby Tunelles')).toBeNull();
    });

    it('opens the group and the sources on click', () => {
      const setGroupOpen = vi.fn();
      const setTab = vi.fn();
      render(<Navigation onlineOpen={false} setGroupOpen={setGroupOpen} setTab={setTab} />);

      fireEvent.click(screen.getByText('Online'));

      expect(setGroupOpen).toHaveBeenCalledWith('online', true);
      expect(setTab).toHaveBeenCalledWith('online-sources');
    });
  });

  describe('library', () => {
    const views = ['Albums', 'Artists', 'Album artists', 'Genres', 'Songs', 'Folders'];

    it('shows no view while the group is closed', () => {
      render(<Navigation />);

      views.forEach((view) => expect(screen.queryByText(view)).toBeNull());
    });

    it('lists the views as children of the group when it is open', () => {
      render(<Navigation libraryOpen />);

      expect(Array.from(document.querySelectorAll('.child')).map((item) => item.textContent)).toEqual(expect.arrayContaining(views));
    });

    it('opens the group and the library on click, and closes the group on the next one', () => {
      const setGroupOpen = vi.fn();
      const setTab = vi.fn();
      const { rerender } = render(<Navigation setGroupOpen={setGroupOpen} setTab={setTab} />);

      fireEvent.click(screen.getByText('Library'));
      rerender(<Navigation libraryOpen setGroupOpen={setGroupOpen} setTab={setTab} />);
      fireEvent.click(screen.getByText('Library'));

      expect(setGroupOpen.mock.calls).toEqual([
        ['library', true],
        ['library', false],
      ]);
      expect(setTab.mock.calls).toEqual([['local']]);
    });

    it('opens a view on click', () => {
      const openLibraryView = vi.fn();
      render(<Navigation libraryOpen openLibraryView={openLibraryView} />);

      fireEvent.click(screen.getByText('Genres'));

      expect(openLibraryView).toHaveBeenCalledWith('genres');
    });

    it('marks the view that is open, and not the group', () => {
      render(<Navigation libraryOpen tab="local" view="tracks" />);

      expect(Array.from(document.querySelectorAll('.active')).map((item) => item.textContent)).toEqual(['Songs']);
    });

    it('marks the group itself when it is closed on the library', () => {
      render(<Navigation tab="local" view="tracks" />);

      expect(Array.from(document.querySelectorAll('.active')).map((item) => item.textContent)).toEqual(['Library']);
    });

    it('marks no view while another tab is open', () => {
      render(<Navigation libraryOpen tab="settings" view="tracks" />);

      expect(Array.from(document.querySelectorAll('.active')).map((item) => item.textContent)).toEqual(['Settings']);
    });
  });

  describe('playlists', () => {
    const playlists = [
      { id: 1, name: 'Road', entries: [] },
      { id: 2, name: 'Night', entries: [] },
    ];

    it('lists the playlists in a group', () => {
      render(<Navigation playlists={playlists} />);

      expect(Array.from(document.querySelectorAll('.playlists .item')).map((item) => item.textContent)).toEqual([
        'Road',
        'Night',
        'New playlist',
        'Import playlists',
      ]);
      expect(document.querySelector('.group .count')).toBeNull();
    });

    it('hides the playlists while the group is closed, and tells how many there are', () => {
      render(<Navigation playlists={playlists} playlistsOpen={false} />);

      expect(screen.queryByText('Road')).toBeNull();
      expect(document.querySelector('.group .count')?.textContent).toBe('2');
    });

    it('opens and closes the group on click', () => {
      const setGroupOpen = vi.fn();
      const { rerender } = render(<Navigation setGroupOpen={setGroupOpen} />);

      fireEvent.click(screen.getByText('Playlists'));
      rerender(<Navigation playlistsOpen={false} setGroupOpen={setGroupOpen} />);
      fireEvent.click(screen.getByText('Playlists'));

      expect(setGroupOpen.mock.calls).toEqual([
        ['playlists', false],
        ['playlists', true],
      ]);
    });

    it('opens a playlist on click and marks only that one as active', () => {
      const openPlaylist = vi.fn();
      render(<Navigation tab="playlist" playlistId={2} playlists={playlists} openPlaylist={openPlaylist} />);

      fireEvent.click(screen.getByText('Road'));

      expect(openPlaylist).toHaveBeenCalledWith(1);
      expect(Array.from(document.querySelectorAll('.active')).map((item) => item.textContent)).toEqual(['Night']);
    });

    it('asks to import playlist files with the button next to the new one', () => {
      const importPlaylists = vi.fn();
      render(<Navigation importPlaylists={importPlaylists} />);

      fireEvent.click(screen.getByRole('button', { name: 'Import playlists' }));

      expect(importPlaylists).toHaveBeenCalledTimes(1);
    });

    it('creates a playlist from the name that was typed, and not from an empty one', () => {
      const createPlaylist = vi.fn();
      render(<Navigation createPlaylist={createPlaylist} />);

      fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));
      fireEvent.submit(screen.getByLabelText('Playlist name'));
      fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));
      fireEvent.change(screen.getByLabelText('Playlist name'), { target: { value: ' Gym ' } });
      fireEvent.submit(screen.getByLabelText('Playlist name'));

      expect(createPlaylist.mock.calls).toEqual([['Gym']]);
      expect(screen.queryByLabelText('Playlist name')).toBeNull();
    });

    it('shows the actions below the group only while it is open', () => {
      render(<Navigation playlistsOpen={false} />);

      expect(screen.queryByRole('button', { name: 'New playlist' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Import playlists' })).toBeNull();
    });

    it('gives up the new playlist on Escape', () => {
      const createPlaylist = vi.fn();
      render(<Navigation createPlaylist={createPlaylist} />);

      fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));
      fireEvent.keyDown(screen.getByLabelText('Playlist name'), { key: 'Escape' });

      expect(screen.queryByLabelText('Playlist name')).toBeNull();
      expect(createPlaylist).not.toHaveBeenCalled();
    });

    it('moves a playlist to where it is dropped', () => {
      const movePlaylist = vi.fn();
      render(<Navigation playlists={playlists} movePlaylist={movePlaylist} />);
      const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

      fireEvent.dragStart(screen.getByText('Night').closest('.item') as HTMLElement, { dataTransfer });
      fireEvent.drop(screen.getByText('Road').closest('.item') as HTMLElement, { dataTransfer });

      expect(movePlaylist).toHaveBeenCalledWith(2, 0);
    });
  });

  describe('as a drawer or a column of icons', () => {
    it.each([
      ['an item', () => fireEvent.click(screen.getByText('Home'))],
      ['a view of the library', () => fireEvent.click(screen.getByText('Albums'))],
      ['a playlist', () => fireEvent.click(screen.getByText('Night'))],
    ])('reports that %s took the app somewhere', (_name, click) => {
      const onNavigate = vi.fn();
      render(<Navigation libraryOpen playlists={[{ id: 1, name: 'Night' } as never]} onNavigate={onNavigate} />);

      click();

      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('does not report the opening of a group, so the drawer stays for the next choice', () => {
      const onNavigate = vi.fn();
      render(<Navigation onNavigate={onNavigate} />);

      fireEvent.click(screen.getByText('Library'));
      fireEvent.click(screen.getByText('Playlists'));

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('marks the column of icons, and gives each item its label as a title for a pointer and a screen reader', () => {
      const { container } = render(<Navigation rail libraryOpen />);

      expect(container.firstElementChild?.className).toContain('rail');
      expect(screen.getByText('Settings').closest('[title]')?.getAttribute('title')).toBe('Settings');
      expect(screen.getByText('Albums').closest('[title]')?.getAttribute('title')).toBe('Albums');
    });

    it('is not a column of icons by default', () => {
      const { container } = render(<Navigation />);

      expect(container.firstElementChild?.className).not.toContain('rail');
    });
  });
});
