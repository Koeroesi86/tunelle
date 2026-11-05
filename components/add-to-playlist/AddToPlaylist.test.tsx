import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import AddToPlaylist from './AddToPlaylist';

const track: Track = { path: '/music/a.flac', artist: '', album: '', title: 'A', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 };
const playlists = [
  { id: 1, name: 'Road', entries: [] },
  { id: 2, name: 'Night', entries: [] },
];

describe('AddToPlaylist', () => {
  const renderButton = (add = vi.fn(), create = vi.fn(), onRowClick = vi.fn()) => {
    render(
      <div onClick={onRowClick}>
        <AddToPlaylist source={track} playlists={playlists} add={add} create={create} />
      </div>
    );
    return { add, create, onRowClick };
  };
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add to a playlist' }));

  it('lists the playlists once it is opened', () => {
    renderButton();
    expect(screen.queryByRole('menu')).toBeNull();

    open();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Road0', 'Night0']);
  });

  it('shows how many tracks a playlist has', () => {
    render(<AddToPlaylist source={track} playlists={[{ ...playlists[0], entries: [{ id: 1, track, available: true }] }]} add={vi.fn()} create={vi.fn()} />);
    open();

    expect(screen.getByRole('menuitem').textContent).toBe('Road1');
  });

  it('puts the focus on the first playlist, or on the name field when there is none', () => {
    const { unmount } = render(<AddToPlaylist source={track} playlists={playlists} add={vi.fn()} create={vi.fn()} />);
    open();
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
    unmount();

    render(<AddToPlaylist source={track} playlists={[]} add={vi.fn()} create={vi.fn()} />);
    open();
    expect(document.activeElement).toBe(screen.getByLabelText('Playlist name'));
  });

  it('goes through the field and the playlists with the arrow keys, around the ends', () => {
    renderButton();
    open();
    const menu = screen.getByRole('menu');
    const focused = () => document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label');

    expect(focused()).toBe('Road0');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Night0');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focused()).toBe('Playlist name');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(focused()).toBe('Night0');
  });

  it('gives the focus back to the button when it closes with the keyboard', () => {
    renderButton();
    open();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add to a playlist' }));
  });

  it('creates the playlist with Enter in the name field', () => {
    const { create } = renderButton();
    open();

    fireEvent.change(screen.getByLabelText('Playlist name'), { target: { value: 'Gym' } });
    fireEvent.submit(screen.getByLabelText('Playlist name'));

    expect(create).toHaveBeenCalledWith('Gym', track);
  });

  it('adds the track to the picked playlist and closes', () => {
    const { add } = renderButton();
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: /Night/ }));

    expect(add).toHaveBeenCalledWith(2, track);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('creates a playlist with the name that was typed, and not with an empty one', () => {
    const { create } = renderButton();
    open();

    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Playlist name'), { target: { value: '  Gym ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith('Gym', track);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and on a click outside', () => {
    renderButton();

    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not pass its clicks to the row that holds it', () => {
    const { onRowClick } = renderButton();

    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Road/ }));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
