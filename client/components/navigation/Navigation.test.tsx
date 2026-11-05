import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Navigation from './Navigation';

describe('Navigation', () => {
  it.each([
    ['Home', 'home'],
    ['Now playing', 'now-playing'],
    ['Radio stations', 'online-sources'],
    ['Liked', 'favourites'],
    ['Equalizer', 'equalizer'],
    ['Settings', 'settings'],
  ])('selects the %s tab on click', (label, tab) => {
    const setTab = vi.fn();
    render(<Navigation setTab={setTab} />);

    fireEvent.click(screen.getByText(label));

    expect(setTab).toHaveBeenCalledWith(tab);
  });

  it('marks only the current tab as active', () => {
    render(<Navigation tab="equalizer" />);

    const active = Array.from(document.querySelectorAll('.active')).map((item) => item.textContent);
    expect(active).toEqual(['Equalizer']);
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

      expect(Array.from(document.querySelectorAll('.playlists .item')).map((item) => item.textContent)).toEqual(['Road', 'Night']);
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

    it('opens the group for the name of a new playlist, without toggling it', () => {
      const setGroupOpen = vi.fn();
      render(<Navigation playlistsOpen={false} setGroupOpen={setGroupOpen} />);

      fireEvent.click(screen.getByRole('button', { name: 'New playlist' }));

      expect(setGroupOpen.mock.calls).toEqual([['playlists', true]]);
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
});
