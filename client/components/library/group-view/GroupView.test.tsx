import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import type { GroupSummary, Track } from '@shared/types/library';
import { createPageCache, storePage } from '../../../redux/library/pages';
import { fetchGroupTracks } from '../../../domain/group-tracks';
import GroupView from './GroupView';

vi.mock('../group-tile', () => ({
  default: ({ group, unknownName, open }: { group: GroupSummary; unknownName: string; open: (group: GroupSummary) => void }) => (
    <button onClick={() => open(group)}>{`tile ${group.name || unknownName}`}</button>
  ),
}));
vi.mock('../genre-card', () => ({
  default: ({ group, unknownName, open }: { group: GroupSummary; unknownName: string; open: (group: GroupSummary) => void }) => (
    <button onClick={() => open(group)}>{`card ${group.name || unknownName}`}</button>
  ),
}));
vi.mock('../../../domain/group-tracks', () => ({ fetchGroupTracks: vi.fn() }));
vi.mock('../artist-photo-menu', () => ({ default: ({ photoKey }: { photoKey: string }) => <div>{`photo menu ${photoKey}`}</div> }));
vi.mock('../artist-photo', () => ({ default: ({ photoKey }: { photoKey: string }) => <div>{`photo ${photoKey}`}</div> }));
vi.mock('../album-sort', () => ({ default: () => <div>album sort</div> }));
vi.mock('../group-albums', () => ({ default: ({ toolbar }: { toolbar: ReactNode }) => <div>{toolbar}group albums</div> }));

const group = (key: string, name: string, albumCount = 1, trackCount = 2): GroupSummary => ({ key, name, albumCount, trackCount, cover: null, covers: [] });

const renderView = (props: Partial<ComponentProps<typeof GroupView>> = {}) => {
  const handlers = { loadPage: vi.fn(), openGroup: vi.fn(), closeGroup: vi.fn(), playTracks: vi.fn() };
  const groups = storePage(createPageCache<GroupSummary>(), 0, [group('adam', 'Adam', 3, 12), group('', '')], 2);

  render(
    <GroupView
      kind="genre"
      groups={groups}
      sort={undefined}
      filter=""
      coverSize={160}
      setCoverSize={vi.fn()}
      selected={[]}
      folders={[]}
      open={undefined}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('GroupView', () => {
  it('shows the genres as cards, the ones without a name as unknown', () => {
    renderView();

    expect(screen.getByText('card Adam')).toBeTruthy();
    expect(screen.getByText('card Unknown genre')).toBeTruthy();
    expect(screen.getByText('2 genres')).toBeTruthy();
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('shows the artists and the album artists as tiles', () => {
    renderView({ kind: 'albumArtist', groups: storePage(createPageCache<GroupSummary>(), 0, [group('adam', 'Adam'), group('', '')], 2) });

    expect(screen.getByText('tile Adam')).toBeTruthy();
    expect(screen.getByText('tile Unknown album artist')).toBeTruthy();
    expect(screen.getByText('2 album artists')).toBeTruthy();
  });

  it('sets the size of the tiles with a slider below them, and has none below the cards of the genres', () => {
    const setCoverSize = vi.fn();
    renderView({ kind: 'artist', coverSize: 180, setCoverSize });

    const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Cover size' });
    expect(slider.value).toBe('180');
    fireEvent.change(slider, { target: { value: '220' } });
    expect(setCoverSize).toHaveBeenCalledWith(220);

    cleanup();
    renderView();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('opens the group of a tile', () => {
    const { openGroup } = renderView({ kind: 'artist' });

    fireEvent.click(screen.getByText('tile Adam'));

    expect(openGroup).toHaveBeenCalledWith({ kind: 'artist', key: 'adam', name: 'Adam' });
  });

  it('opens the genre of a card, with the key the library compares by', () => {
    const { openGroup } = renderView();

    fireEvent.click(screen.getByText('card Adam'));

    expect(openGroup).toHaveBeenCalledWith({ kind: 'genre', key: 'adam', name: 'Adam' });
  });

  it('asks for the pages it shows', () => {
    const { loadPage } = renderView({ groups: createPageCache<GroupSummary>() });

    expect(loadPage).toHaveBeenCalledWith(0);
  });

  it('shows the albums of the open group with its name and a way back', () => {
    const { closeGroup } = renderView({ kind: 'genre', open: { kind: 'genre', key: '', name: '' } });

    expect(screen.getByText('group albums')).toBeTruthy();
    expect(screen.getByText('Unknown genre')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(closeGroup).toHaveBeenCalled();
  });

  it('offers to change the photo of an open artist or album artist that has a name, not of a genre or of the tracks without one', () => {
    renderView({ kind: 'artist', open: { kind: 'artist', key: 'adam', name: 'Adam' } });
    expect(screen.getByText('photo menu adam')).toBeTruthy();
    expect(screen.getByText('photo adam')).toBeTruthy();

    cleanup();
    renderView({ kind: 'albumArtist', open: { kind: 'albumArtist', key: '', name: '' } });
    expect(screen.queryByText(/photo/)).toBeNull();

    cleanup();
    renderView({ kind: 'genre', open: { kind: 'genre', key: 'pop', name: 'Pop' } });
    expect(screen.queryByText(/photo/)).toBeNull();
  });

  it('plays all the tracks of the open group in the selected folders, or shuffled', async () => {
    const tracks = [{ path: 'a' }, { path: 'b' }, { path: 'c' }] as Track[];
    vi.mocked(fetchGroupTracks).mockResolvedValue(tracks);
    const { playTracks } = renderView({ open: { kind: 'genre', key: 'jazz', name: 'Jazz' }, selected: [], folders: [] });

    fireEvent.click(screen.getByText('Play all'));
    await waitFor(() => expect(playTracks).toHaveBeenCalledWith(tracks));
    expect(fetchGroupTracks).toHaveBeenCalledWith({ kind: 'genre', key: 'jazz', name: 'Jazz' }, []);

    fireEvent.click(screen.getByText('Shuffle'));
    await waitFor(() => expect(playTracks).toHaveBeenCalledTimes(2));
    expect(playTracks.mock.calls[1][0]).toHaveLength(3);
  });

  it('listens to the scrolling of the list again when it comes back from the albums', () => {
    const groups = storePage(createPageCache<GroupSummary>(), 0, [group('adam', 'Adam')], 1);
    const handlers = { loadPage: vi.fn(), openGroup: vi.fn(), closeGroup: vi.fn(), playTracks: vi.fn() };
    const view = (open?: { kind: 'genre'; key: string; name: string }) => (
      <GroupView
        kind="genre"
        groups={groups}
        sort={undefined}
        filter=""
        coverSize={160}
        setCoverSize={vi.fn()}
        selected={[]}
        folders={[]}
        open={open}
        {...handlers}
      />
    );
    const listened = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const { rerender } = render(view({ kind: 'genre', key: 'adam', name: 'Adam' }));

    rerender(view());

    const scrolled = listened.mock.contexts.filter(
      (element, index) =>
        listened.mock.calls[index][0] === 'scroll' && element instanceof HTMLElement && element.className.includes('listing') && document.body.contains(element)
    );
    listened.mockRestore();
    expect(scrolled.length).toBeGreaterThan(0);
  });
});
