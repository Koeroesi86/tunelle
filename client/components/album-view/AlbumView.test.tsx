import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AlbumSummary } from '@shared/types/library';
import { createPageCache, storePage } from '../../redux/library/pages';
import AlbumView from './AlbumView';

vi.mock('../album-view-thumbnail', () => ({ default: () => null }));

const album = (index: number): AlbumSummary => ({
  id: `/music/${index} - Album`,
  title: 'Album',
  path: `/music/${index}`,
  artist: 'Artist',
  cover: null,
  duration: 60,
  year: 2020,
  trackCount: 1,
});

const baseProps = {
  sort: undefined,
  selected: [],
  folders: [],
  search: undefined,
  coverSize: 160,
  setCoverSize: vi.fn(),
  playTracks: vi.fn(),
  selectAlbum: vi.fn(),
  loadPage: vi.fn(),
};

describe('AlbumView', () => {
  const empty = storePage(createPageCache<AlbumSummary>(), 0, [], 0);
  const nothing = /Nothing in the library/;

  it('tells how many albums the whole list has', () => {
    const albums = storePage(createPageCache<AlbumSummary>(), 0, [album(1), album(2)], 420);

    render(<AlbumView {...baseProps} albums={albums} />);

    expect(screen.getByText('420 albums')).toBeTruthy();
  });

  it('says that nothing matches the search', () => {
    render(<AlbumView {...baseProps} albums={empty} search="halo" />);

    expect(screen.getByText('Nothing in the library matches “halo”')).toBeTruthy();
  });

  it('says nothing while the first page is on its way, or with no search', () => {
    expect(render(<AlbumView {...baseProps} albums={createPageCache<AlbumSummary>()} search="halo" />).queryByText(nothing)).toBeNull();
    expect(render(<AlbumView {...baseProps} albums={empty} />).queryByText(nothing)).toBeNull();
  });

  it('sets the size of the covers from the slider of the bar below the list', () => {
    const setCoverSize = vi.fn();
    render(<AlbumView {...baseProps} setCoverSize={setCoverSize} coverSize={180} albums={empty} />);
    const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Cover size' });

    expect([slider.value, slider.min, slider.max, slider.step]).toEqual(['180', '120', '240', '10']);

    fireEvent.change(slider, { target: { value: '220' } });

    expect(setCoverSize).toHaveBeenCalledWith(220);
  });
});
