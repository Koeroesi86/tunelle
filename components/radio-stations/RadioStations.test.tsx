import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RadioStation } from '../../types/radio';
import type { RadioState } from '../../client/redux/radio/reducer';
import RadioStations from './RadioStations';

// the heart is tested with its own component, it needs the store
vi.mock('../favourite-button', () => ({ default: () => null }));

const jazz: RadioStation = { uuid: 'a', name: 'Jazz FM', country: 'Hungary', tags: ['jazz', 'lounge', 'swing', 'bebop'], codec: 'MP3', bitrate: 128 };
const rock: RadioStation = { uuid: 'b', name: 'Rock Radio', country: '', tags: [], codec: 'flac', bitrate: 0 };

const radio = (state: Partial<RadioState> = {}): RadioState => ({
  query: {},
  offset: 0,
  hasMore: false,
  stations: [jazz, rock],
  tags: [{ name: 'jazz', stationCount: 12 }],
  countries: [
    { value: 'HU', name: 'Hungary', stationCount: 40 },
    { value: 'DE', name: 'Germany', stationCount: 90 },
  ],
  languages: [{ value: 'hungarian', name: 'hungarian', stationCount: 30 }],
  codecs: [{ value: 'AAC', name: 'AAC', stationCount: 50 }],
  loading: false,
  ...state,
});

const renderPanel = (state?: Partial<RadioState>, currentStation?: string) => {
  const handlers = { search: vi.fn(), loadTags: vi.fn(), loadOptions: vi.fn(), play: vi.fn() };
  const view = render(<RadioStations radio={radio(state)} currentStation={currentStation} {...handlers} />);
  return { ...handlers, ...view };
};

describe('RadioStations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the genres and the most popular stations when it opens', () => {
    const { search, loadTags, loadOptions } = renderPanel();

    expect(loadTags).toHaveBeenCalledOnce();
    expect(loadOptions).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({});
  });

  it('shows the saved name in the search box when the filters arrive after it opened', () => {
    const { rerender, search } = renderPanel();
    search.mockClear();

    rerender(<RadioStations radio={radio({ query: { name: 'jazz' } })} loadTags={vi.fn()} loadOptions={vi.fn()} play={vi.fn()} search={search} />);

    expect(screen.getByPlaceholderText('Search stations')).toHaveProperty('value', 'jazz');
    act(() => vi.advanceTimersByTime(1000));
    expect(search).not.toHaveBeenCalled();
  });

  it('shows the logo of a station that has one, served by uuid, and not for the others', () => {
    const { container } = renderPanel({ stations: [{ ...jazz, hasLogo: true }, rock] });

    const logos = Array.from(container.querySelectorAll('img'));
    expect(logos).toHaveLength(1);
    expect(logos[0].getAttribute('src')).toContain('/radio-logo/a');
  });

  it('hides a logo that does not load', () => {
    const { container } = renderPanel({ stations: [{ ...jazz, hasLogo: true }] });

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
  });

  it('says that the stations come from a community directory that Tunelle does not run', () => {
    renderPanel();

    expect(screen.getByText('Stations come from the community directory radio-browser.info. Tunelle does not run or check them.')).toBeTruthy();
  });

  it('lists the stations with their details', () => {
    renderPanel();

    expect(screen.getByText('Jazz FM')).toBeTruthy();
    expect(screen.getByText('Hungary')).toBeTruthy();
    expect(screen.getByText('jazz, lounge, swing')).toBeTruthy();
    expect(screen.getByTitle('Unknown bitrate').textContent).toBe('—');
  });

  it('shows the codec as a pill, the lossless one in the accent colour, and the bitrate in its own column', () => {
    renderPanel();

    expect(screen.getByText('MP3').classList.contains('lossless')).toBe(false);
    expect(screen.getByText('FLAC').classList.contains('lossless')).toBe(true);
    expect(screen.getByText('128')).toBeTruthy();
  });

  it('lights a filter that is on', () => {
    renderPanel({ query: { country: 'HU', bitrateMin: 192 } });

    expect(['Country', 'Minimum bitrate', 'Genre', 'Language'].map((label) => screen.getByLabelText(label).classList.contains('active'))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('plays a station on double click', () => {
    const { play } = renderPanel();

    fireEvent.doubleClick(screen.getByText('Rock Radio'));

    expect(play).toHaveBeenCalledWith(rock);
  });

  it('plays a station from its play button', () => {
    const { play, container } = renderPanel();

    fireEvent.click(container.querySelector('.playButton') as Element);

    expect(play).toHaveBeenCalledWith(jazz);
  });

  it('marks the station that is playing', () => {
    renderPanel(undefined, 'b');

    expect(screen.getByText('Rock Radio').parentElement?.parentElement?.classList.contains('current')).toBe(true);
    expect(screen.getByText('Jazz FM').parentElement?.parentElement?.classList.contains('current')).toBe(false);
  });

  it('searches by name after typing stops', () => {
    const { search } = renderPanel();
    search.mockClear();

    fireEvent.change(screen.getByPlaceholderText('Search stations'), { target: { value: 'jaz' } });
    fireEvent.change(screen.getByPlaceholderText('Search stations'), { target: { value: ' jazz ' } });
    expect(search).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({ name: 'jazz' });
  });

  it('unmounts cleanly when a search returns the dispatched action', () => {
    const { search, unmount } = renderPanel();
    search.mockReturnValue({ type: 'SEARCH_RADIO' });
    fireEvent.change(screen.getByPlaceholderText('Search stations'), { target: { value: 'jazz' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(() => unmount()).not.toThrow();
  });

  it('filters by genre and keeps the name', () => {
    const { search } = renderPanel({ query: { name: 'fm' } });
    search.mockClear();

    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'jazz' } });
    expect(search).toHaveBeenCalledWith({ name: 'fm', tag: 'jazz' });

    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: '' } });
    expect(search).toHaveBeenLastCalledWith({ name: 'fm', tag: undefined });
  });

  it('searches with a filter at once and keeps the others', () => {
    const { search } = renderPanel({ query: { name: 'fm', tag: 'jazz' } });
    search.mockClear();

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'HU' } });
    expect(search).toHaveBeenLastCalledWith({ name: 'fm', tag: 'jazz', country: 'HU' });

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'hungarian' } });
    fireEvent.change(screen.getByLabelText('Codec'), { target: { value: 'AAC' } });
    fireEvent.change(screen.getByLabelText('Minimum bitrate'), { target: { value: '192' } });
    expect(search).toHaveBeenNthCalledWith(2, expect.objectContaining({ language: 'hungarian' }));
    expect(search).toHaveBeenNthCalledWith(3, expect.objectContaining({ codec: 'AAC' }));
    expect(search).toHaveBeenLastCalledWith({ name: 'fm', tag: 'jazz', bitrateMin: 192 });
  });

  it('shows the station counts and shows the selected values', () => {
    renderPanel({ query: { country: 'DE', bitrateMin: 320 } });

    expect(screen.getByRole('option', { name: 'Germany (90)' })).toBeTruthy();
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('DE');
    expect((screen.getByLabelText('Minimum bitrate') as HTMLSelectElement).value).toBe('320');
  });

  it('keeps a saved filter selectable when its list did not load', () => {
    renderPanel({ query: { country: 'HU', codec: 'FLAC' }, countries: [], codecs: [] });

    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('HU');
    expect((screen.getByLabelText('Codec') as HTMLSelectElement).value).toBe('FLAC');
    expect(screen.getByLabelText('Language')).toBeTruthy();
  });

  it('counts the active filters and clears them but not the sort', () => {
    const { search } = renderPanel({ query: { name: 'fm', country: 'HU', sort: 'name', descending: false } });
    search.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 filters' }));

    expect(search).toHaveBeenCalledWith({ sort: 'name', descending: false });
    expect((screen.getByPlaceholderText('Search stations') as HTMLInputElement).value).toBe('');
  });

  it('does not run the cleared name search again when the typing delay ends', () => {
    const { search, rerender } = renderPanel({ query: { name: 'fm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear 1 filter' }));
    // the store has the cleared query by then
    rerender(<RadioStations radio={radio({ query: {} })} search={search} loadTags={vi.fn()} loadOptions={vi.fn()} play={vi.fn()} />);
    search.mockClear();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(search).not.toHaveBeenCalled();
  });

  it('has nothing to clear without filters', () => {
    renderPanel({ query: { sort: 'votes' } });

    expect((screen.getByRole('button', { name: 'Clear filters' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sorts by a field and a direction, and goes back to the default', () => {
    const { search } = renderPanel({ query: { country: 'HU' } });
    search.mockClear();

    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('popularity');
    expect(screen.getByRole('button', { name: 'Order: Descending' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'bitrate' } });
    expect(search).toHaveBeenLastCalledWith({ country: 'HU', sort: 'bitrate' });

    fireEvent.click(screen.getByRole('button', { name: 'Order: Descending' }));
    expect(search).toHaveBeenLastCalledWith({ country: 'HU', descending: false });

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'popularity' } });
    expect(search).toHaveBeenLastCalledWith({ country: 'HU', sort: undefined });
  });

  describe('sorting by a column header', () => {
    const sortOf = (name: string) => screen.getByRole('button', { name }).closest('[role="columnheader"]')?.getAttribute('aria-sort');

    it('sorts by a column in its own direction and flips the sorted one', () => {
      const { search } = renderPanel({ query: { country: 'HU' } });
      search.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'Name' }));
      expect(search).toHaveBeenLastCalledWith({ country: 'HU', sort: 'name', descending: false });

      fireEvent.click(screen.getByRole('button', { name: 'Bitrate' }));
      expect(search).toHaveBeenLastCalledWith({ country: 'HU', sort: 'bitrate', descending: undefined });
    });

    it('goes back and forth on the column that is sorted', () => {
      const { search } = renderPanel({ query: { sort: 'country', descending: false } });
      search.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'Country' }));

      expect(search).toHaveBeenCalledWith({ sort: 'country', descending: undefined });
    });

    it('exposes the direction of the sorted column only, and has no button for the columns that cannot sort', () => {
      renderPanel({ query: { sort: 'bitrate' } });

      expect(sortOf('Bitrate')).toBe('descending');
      expect([sortOf('Name'), sortOf('Country')]).toEqual(['none', 'none']);
      expect(screen.getByRole('columnheader', { name: 'Genres' }).getAttribute('aria-sort')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Genres' })).toBeNull();
    });

    it('has no header without stations', () => {
      renderPanel({ stations: [] });

      expect(screen.queryByRole('columnheader')).toBeNull();
    });
  });

  it('loads the next page of a narrowed list only while there is one', () => {
    const { search } = renderPanel({ query: { country: 'HU' }, offset: 60, hasMore: true });
    search.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(search).toHaveBeenCalledWith({ country: 'HU', offset: 120 });
  });

  it('hides load more at the end of the list and while loading', () => {
    const view = renderPanel({ hasMore: false });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();

    view.rerender(<RadioStations radio={radio({ hasMore: true, loading: true })} search={vi.fn()} loadTags={vi.fn()} loadOptions={vi.fn()} play={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows what is going on instead of an empty list', () => {
    const view = renderPanel({ stations: [], loading: true });
    expect(screen.getByText('Loading stations…')).toBeTruthy();

    view.rerender(<RadioStations radio={radio({ stations: [] })} search={vi.fn()} loadTags={vi.fn()} loadOptions={vi.fn()} play={vi.fn()} />);
    expect(screen.getByText('No stations found')).toBeTruthy();

    view.rerender(<RadioStations radio={radio({ stations: [], error: 'offline' })} search={vi.fn()} loadTags={vi.fn()} loadOptions={vi.fn()} play={vi.fn()} />);
    expect(screen.getByText('The station directory is not available: offline')).toBeTruthy();
    expect(screen.queryByText('No stations found')).toBeNull();
  });
});
