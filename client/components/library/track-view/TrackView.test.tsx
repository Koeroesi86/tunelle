import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import type { TrackSort } from '@shared/types/library-query';
import { createPageCache, storePage } from '../../../redux/library/pages';
import TrackView from './TrackView';
import { pageSize } from '../../../constants/library';

// the heart is tested with its own component, it needs the store
vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-playlist', () => ({ default: () => null }));
vi.mock('../add-to-queue', () => ({ default: () => null }));

const track = (index: number): Track => ({
  path: `/music/${index}.flac`,
  artist: 'Artist',
  album: 'Album',
  title: `Title ${index}`,
  year: 2020,
  track: index,
  disk: 1,
  genre: '',
  picture: null,
  duration: 60,
});

const baseProps = {
  currentSong: null,
  offlineFolders: [],
  sort: undefined,
  selected: [],
  folders: [],
  search: undefined,
  playTracks: vi.fn(),
  loadPage: vi.fn(),
  setSort: vi.fn(),
  selectedTracks: {},
  toggleTrack: vi.fn(),
  selectTracks: vi.fn(),
  clearSelection: vi.fn(),
};

describe('TrackView', () => {
  const firstPage = storePage(
    createPageCache<Track>(),
    0,
    Array.from({ length: pageSize }, (_, index) => track(index)),
    50000
  );

  it('renders the rows of the window only, in a box as high as the whole list', () => {
    const { container, queryByText } = render(<TrackView {...baseProps} tracks={firstPage} />);

    expect(queryByText('Title 0')).not.toBeNull();
    expect(queryByText('Title 99')).toBeNull();
    expect(container.querySelectorAll('[class]').length).toBeLessThan(400);
    expect(container.querySelector<HTMLElement>('.window')?.style.height).toBe('1400000px');
  });

  it('tells how many tracks the whole list has', () => {
    render(<TrackView {...baseProps} tracks={firstPage} />);

    expect(screen.getByText('50000 tracks')).toBeTruthy();
  });

  it('keeps Clear selection and Play selected off until a track is selected', () => {
    render(<TrackView {...baseProps} tracks={firstPage} />);

    expect((screen.getByText('Clear selection') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Play selected') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Select All') as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks the selected tracks and tells the store about a click, a clear and a play', () => {
    const toggleTrack = vi.fn();
    const clearSelection = vi.fn();
    const playTracks = vi.fn();
    const selectedTracks = { [track(1).path]: track(1), [track(3).path]: track(3) };
    render(
      <TrackView
        {...baseProps}
        tracks={firstPage}
        selectedTracks={selectedTracks}
        toggleTrack={toggleTrack}
        clearSelection={clearSelection}
        playTracks={playTracks}
      />
    );

    expect(screen.getByText('Title 1').closest('.trackViewItem')?.classList.contains('selected')).toBe(true);
    expect(screen.getByText('Title 2').closest('.trackViewItem')?.classList.contains('selected')).toBe(false);
    fireEvent.click(screen.getByText('Title 2'));
    fireEvent.click(screen.getByText('Play selected'));
    fireEvent.click(screen.getByText('Clear selection'));

    expect(toggleTrack).toHaveBeenCalledWith(track(2));
    expect(playTracks).toHaveBeenCalledWith([track(1), track(3)]);
    expect(clearSelection).toHaveBeenCalled();
  });

  it('plays a track that is double clicked and selects only it', () => {
    const selectTracks = vi.fn();
    const playTracks = vi.fn();
    render(<TrackView {...baseProps} tracks={firstPage} selectTracks={selectTracks} playTracks={playTracks} />);

    fireEvent.doubleClick(screen.getByText('Title 2'));

    expect(playTracks).toHaveBeenCalledWith([track(2)]);
    expect(selectTracks).toHaveBeenCalledWith([track(2)]);
  });

  it('requests the pages missing for the window', () => {
    const loadPage = vi.fn();
    render(<TrackView {...baseProps} tracks={firstPage} loadPage={loadPage} />);

    expect(loadPage).not.toHaveBeenCalled();
  });

  it('requests the first page of an empty cache', () => {
    const loadPage = vi.fn();
    render(<TrackView {...baseProps} tracks={createPageCache<Track>()} loadPage={loadPage} />);

    expect(loadPage).toHaveBeenCalledWith(0);
  });
  it('dims the tracks in an offline folder', () => {
    const { getByText } = render(<TrackView {...baseProps} tracks={firstPage} offlineFolders={['/music']} />);

    expect(getByText('Title 0').closest('[title]')?.getAttribute('title')).toMatch(/cannot be reached/);
  });

  it('shows the title before the artist and the album, and the duration last', () => {
    render(<TrackView {...baseProps} tracks={firstPage} />);

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['#', 'Title', 'Artist', 'Album', 'Year', 'Duration']);
  });

  it('marks the track that plays, and no other', () => {
    const { container } = render(<TrackView {...baseProps} tracks={firstPage} currentSong={track(2)} />);

    expect(container.querySelectorAll('.bars')).toHaveLength(1);
    expect(screen.getByText('Title 2').closest('.trackViewItem')?.classList.contains('current')).toBe(true);
  });

  describe('sorting by a column header', () => {
    const headers = () => screen.getAllByRole('columnheader');
    const headerOf = (name: string) => screen.getByRole('button', { name });
    const sortOf = (name: string) => headerOf(name).closest('[role="columnheader"]')?.getAttribute('aria-sort');

    it.each([
      ['Title', 'title'],
      ['Artist', 'artist'],
      ['Album', 'album'],
      ['Year', 'year'],
      ['Duration', 'duration'],
      ['#', 'track'],
    ])('sorts by %s ascending on the first click', (name, field) => {
      const setSort = vi.fn();
      render(<TrackView {...baseProps} tracks={firstPage} setSort={setSort} />);

      fireEvent.click(headerOf(name));

      expect(setSort).toHaveBeenCalledWith({ field, direction: 'asc' });
    });

    it('goes ascending, descending and back to the default order on the same column', () => {
      const setSort = vi.fn();
      const { rerender } = render(<TrackView {...baseProps} tracks={firstPage} setSort={setSort} />);
      const cycle = (sort: TrackSort | undefined) => {
        rerender(<TrackView {...baseProps} tracks={firstPage} sort={sort} setSort={setSort} />);
        fireEvent.click(headerOf('Title'));
      };

      cycle(undefined);
      cycle({ field: 'title', direction: 'asc' });
      cycle({ field: 'title', direction: 'desc' });
      cycle({ field: 'artist', direction: 'desc' });

      expect(setSort.mock.calls).toEqual([
        [{ field: 'title', direction: 'asc' }],
        [{ field: 'title', direction: 'desc' }],
        [undefined],
        [{ field: 'title', direction: 'asc' }],
      ]);
    });

    it('exposes the direction of the sorted column only', () => {
      render(<TrackView {...baseProps} tracks={firstPage} sort={{ field: 'year', direction: 'desc' }} />);

      expect(headers()).toHaveLength(6);
      expect(sortOf('Year')).toBe('descending');
      expect(['Title', 'Artist', 'Album', 'Duration', '#'].map(sortOf)).toEqual(Array(5).fill('none'));
    });

    it('exposes the ascending direction', () => {
      render(<TrackView {...baseProps} tracks={firstPage} sort={{ field: 'title', direction: 'asc' }} />);

      expect(sortOf('Title')).toBe('ascending');
    });

    it('starts from the top when the sort or the folders change, and not when they stay', () => {
      const { container, rerender } = render(<TrackView {...baseProps} tracks={firstPage} />);
      const listing = container.querySelector<HTMLElement>('.listing');
      if (!listing) throw new Error('no listing');

      listing.scrollTop = 300;
      rerender(<TrackView {...baseProps} tracks={firstPage} />);
      expect(listing.scrollTop).toBe(300);

      rerender(<TrackView {...baseProps} tracks={firstPage} sort={{ field: 'title', direction: 'asc' }} />);
      expect(listing.scrollTop).toBe(0);

      listing.scrollTop = 300;
      rerender(
        <TrackView
          {...baseProps}
          tracks={firstPage}
          sort={{ field: 'title', direction: 'asc' }}
          folders={[{ path: '/m', lastModified: 1 }]}
          selected={['/m']}
        />
      );
      expect(listing.scrollTop).toBe(0);
    });

    it('starts from the top when the search changes', () => {
      const { container, rerender } = render(<TrackView {...baseProps} tracks={firstPage} />);
      const listing = container.querySelector<HTMLElement>('.listing');
      if (!listing) throw new Error('no listing');

      listing.scrollTop = 300;
      rerender(<TrackView {...baseProps} tracks={firstPage} search="halo" />);

      expect(listing.scrollTop).toBe(0);
    });
  });

  describe('searching', () => {
    const empty = storePage(createPageCache<Track>(), 0, [], 0);

    it('says that nothing matches the search', () => {
      const { getByText } = render(<TrackView {...baseProps} tracks={empty} search="halo" />);

      expect(getByText('Nothing in the library matches “halo”')).toBeTruthy();
    });

    it('says nothing while the first page is on its way, with no search, or when something matches', () => {
      const pending = createPageCache<Track>();

      expect(render(<TrackView {...baseProps} tracks={pending} search="halo" />).queryByText(/Nothing in the library/)).toBeNull();
      expect(render(<TrackView {...baseProps} tracks={empty} />).queryByText(/Nothing in the library/)).toBeNull();
      expect(render(<TrackView {...baseProps} tracks={firstPage} search="halo" />).queryByText(/Nothing in the library/)).toBeNull();
    });
  });
});
