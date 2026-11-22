import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupOverview from './GroupOverview';

describe('GroupOverview', () => {
  it('lists the views of the library and opens one', () => {
    const openLibraryView = vi.fn();
    render(<GroupOverview group="library" openLibraryView={openLibraryView} />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Genres' }));

    expect(openLibraryView).toHaveBeenCalledWith('genres');
  });

  it('lists the radio, the providers and the nearby Tunelles of the online group', () => {
    const openOnlineView = vi.fn();
    const openOverview = vi.fn();
    render(<GroupOverview group="online" openOnlineView={openOnlineView} openOverview={openOverview} />);

    fireEvent.click(screen.getByRole('button', { name: 'Radio stations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nearby Tunelles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plex' }));

    expect(openOnlineView.mock.calls).toEqual([['radio'], ['nearby']]);
    expect(openOverview).toHaveBeenCalledWith('plex');
  });

  it('lists the servers page of a provider, and the sections only once it has a server', () => {
    const openOnlineView = vi.fn();
    const { rerender } = render(<GroupOverview group="plex" openOnlineView={openOnlineView} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Servers']);
    rerender(<GroupOverview group="plex" sourceKinds={['plex']} openOnlineView={openOnlineView} />);
    fireEvent.click(screen.getByRole('button', { name: 'Albums' }));

    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(openOnlineView).toHaveBeenCalledWith('plex:albums');
  });

  it('lists the playlists and opens one, or says there are none', () => {
    const openPlaylist = vi.fn();
    const { rerender } = render(<GroupOverview group="playlists" openPlaylist={openPlaylist} />);

    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
    rerender(<GroupOverview group="playlists" playlists={[{ id: 4, name: 'Night', entries: [] }]} openPlaylist={openPlaylist} />);
    fireEvent.click(screen.getByRole('button', { name: 'Night' }));

    expect(openPlaylist).toHaveBeenCalledWith(4);
  });
});
