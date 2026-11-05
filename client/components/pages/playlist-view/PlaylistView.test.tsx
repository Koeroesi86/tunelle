import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import PlaylistView from './PlaylistView';

const queued = vi.hoisted(() => vi.fn());
vi.mock('../../library/add-to-queue', async () => {
  const { createElement } = await import('react');

  return {
    default: ({ getTracks, next }: { getTracks: () => Promise<unknown[]>; next?: boolean }) =>
      createElement('button', { 'aria-label': next ? 'Play next' : 'Add to the queue', onClick: () => void getTracks().then(queued) }),
  };
});

const track = (title: string): Track => ({
  path: `/music/${title}.flac`,
  artist: 'Artist',
  album: 'Record',
  title,
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
});
const playlist: Playlist = {
  id: 7,
  name: 'Road',
  entries: [
    { id: 1, track: track('One'), available: true },
    { id: 2, track: track('Gone'), available: false },
    { id: 3, track: track('Three'), available: true },
  ],
};

describe('PlaylistView', () => {
  afterEach(() => {
    queued.mockReset();
  });

  const renderView = (shown: Playlist | null = playlist) => {
    const props = { playTracks: vi.fn(), rename: vi.fn(), remove: vi.fn(), removeEntry: vi.fn(), moveEntry: vi.fn() };
    render(<PlaylistView playlist={shown ?? undefined} {...props} />);
    return props;
  };
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.entry'));

  it('numbers the rows in the order of the playlist', () => {
    renderView();

    expect(rows().map((row) => row.querySelector('.number')?.textContent)).toEqual(['1', '2', '3']);
  });

  it('shows the format of a track', () => {
    renderView({ ...playlist, entries: [{ id: 1, track: { ...track('One'), codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }, available: true }] });

    expect(screen.getByText('FLAC 24/96')).toBeTruthy();
  });

  it('adds a track that is available to the queue, and offers it for none that the library lost', async () => {
    renderView();

    const buttons = screen.getAllByRole('button', { name: 'Add to the queue' });
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[2]);
    await waitFor(() => expect(queued).toHaveBeenCalledWith([playlist.entries[2].track]));
  });

  it('adds the tracks that are available, or puts them next, from the header', async () => {
    renderView();
    const available = [playlist.entries[0].track, playlist.entries[2].track];

    fireEvent.click(screen.getAllByRole('button', { name: 'Add to the queue' })[0]);
    await waitFor(() => expect(queued).toHaveBeenLastCalledWith(available));
    fireEvent.click(screen.getAllByRole('button', { name: 'Play next' })[0]);
    await waitFor(() => expect(queued).toHaveBeenCalledTimes(2));

    expect(queued).toHaveBeenLastCalledWith(available);
  });

  it('puts a track that is available next', async () => {
    renderView();

    const buttons = screen.getAllByRole('button', { name: 'Play next' });
    expect(buttons).toHaveLength(3);

    fireEvent.click(buttons[1]);
    await waitFor(() => expect(queued).toHaveBeenCalledWith([playlist.entries[0].track]));
  });

  it('says so when the playlist is not there', () => {
    renderView(null);

    expect(screen.getByText('There is no such playlist.')).toBeTruthy();
  });

  it('tells that an empty playlist is empty', () => {
    renderView({ ...playlist, entries: [] });

    expect(screen.getByText(/This playlist is empty/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Play all' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the tracks in order, a track the library lost greyed out', () => {
    renderView();

    expect(rows().map((row) => row.querySelector('.title')?.textContent)).toEqual(['One', 'Gone', 'Three']);
    expect(rows().map((row) => row.classList.contains('unavailable'))).toEqual([false, true, false]);
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.getByText('3 tracks')).toBeTruthy();
  });

  it('plays the tracks that are available and skips the others', () => {
    const { playTracks } = renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));

    expect(playTracks.mock.calls[0][0].map(({ title }: Track) => title)).toEqual(['One', 'Three']);
  });

  it('plays from a track on', () => {
    const { playTracks } = renderView();

    fireEvent.doubleClick(rows()[0]);
    fireEvent.doubleClick(rows()[1]);
    fireEvent.click(rows()[2].querySelector('button') as HTMLElement);

    expect(playTracks.mock.calls.map(([tracks]) => tracks.map(({ title }: Track) => title))).toEqual([['One', 'Three'], ['Three']]);
  });

  it('removes a track from the playlist', () => {
    const { removeEntry } = renderView();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from playlist' })[2]);

    expect(removeEntry).toHaveBeenCalledWith(7, 3);
  });

  it('renames the playlist from its name and ignores an empty or unchanged name', () => {
    const { rename } = renderView();
    const edit = (value: string) => {
      fireEvent.click(screen.getByTitle('Rename'));
      fireEvent.change(screen.getByLabelText('Rename'), { target: { value } });
      fireEvent.submit(screen.getByLabelText('Rename'));
    };

    edit('  ');
    edit('Road');
    edit(' Night ');

    expect(rename.mock.calls).toEqual([[7, 'Night']]);
  });

  it('asks twice before it deletes the playlist', () => {
    const { remove } = renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Delete playlist' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));

    expect(remove).toHaveBeenCalledWith(7);
  });

  it('moves a track to where it is dropped', () => {
    const { moveEntry } = renderView();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    fireEvent.dragStart(rows()[2], { dataTransfer });
    fireEvent.dragOver(rows()[0], { dataTransfer });
    fireEvent.drop(rows()[0], { dataTransfer });

    expect(moveEntry).toHaveBeenCalledWith(7, 3, 0);
  });

  it('does not take a drop that did not start in the list', () => {
    const { moveEntry } = renderView();

    fireEvent.drop(rows()[0]);

    expect(moveEntry).not.toHaveBeenCalled();
  });
});
