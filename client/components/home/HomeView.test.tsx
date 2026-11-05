import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Favourite, HistoryItem } from '@shared/types/favourites';
import type { Playlist } from '@shared/types/playlists';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import { stationFavourite, trackFavourite } from '../../utils/favourites';
import { toRadioTrack } from '../../utils/radio-track';
import HomeView from './HomeView';

vi.mock('../favourite-button', () => ({ default: () => null }));

const track: Track = {
  path: '/music/a.flac',
  artist: 'Artist',
  album: 'Record',
  title: 'One',
  year: 2020,
  track: 1,
  disk: 1,
  genre: '',
  picture: null,
  duration: 65,
};
const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };

const liked = (item: ReturnType<typeof trackFavourite> | ReturnType<typeof stationFavourite>, available = true): Favourite => ({
  ...item,
  addedAt: 1,
  available,
});

const playlistOf = (id: number, name: string, tracks: Track[]): Playlist => ({
  id,
  name,
  entries: tracks.map((entry, index) => ({ id: index, track: entry, available: true })),
});

const played = (item: ReturnType<typeof trackFavourite>, available = true): HistoryItem => ({ ...item, playedAt: 1, available });

describe('HomeView', () => {
  const renderView = (history: HistoryItem[], currentSong: Track | null = null, extra: Partial<ComponentProps<typeof HomeView>> = {}) => {
    const props = { playTracks: vi.fn(), playStation: vi.fn(), clearHistory: vi.fn(), resume: vi.fn(), addFolder: vi.fn() };
    render(<HomeView history={history} currentSong={currentSong} {...props} {...extra} />);
    return props;
  };

  it('tells that nothing was played yet and has nothing to clear', () => {
    renderView([]);

    expect(screen.getByText(/Nothing was played yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear history' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps the title and the clear button out of the list that scrolls', () => {
    renderView([played(trackFavourite(track))]);

    const list = screen.getByText('One').closest('div')?.parentElement;

    expect(list?.contains(screen.getByText('One'))).toBe(true);
    expect(list?.contains(screen.getByRole('button', { name: 'Clear history' }))).toBe(false);
    expect(list?.contains(screen.getByText('Recently played'))).toBe(false);
  });

  it('lists the tracks and the stations in the order of the history', () => {
    renderView([played(stationFavourite(station)), played(trackFavourite(track))]);

    expect(Array.from(document.querySelectorAll('.name')).map((name) => name.textContent)).toEqual(['Jazz FM', 'One']);
    expect(screen.getByText('Artist')).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('Radio station')).toBeTruthy();
    expect(screen.getByText('00:01:05')).toBeTruthy();
  });

  it('gives a track and a station the same cells, so the columns line up', () => {
    renderView([
      played(trackFavourite(track)),
      played(stationFavourite(station)),
      played(trackFavourite({ ...track, path: '/music/unavailable.flac' }), false),
    ]);

    const cells = Array.from(document.querySelectorAll('.item')).map((row) => Array.from(row.children).map((cell) => cell.className.replace(/\s.*/, '')));
    expect(cells[1]).toEqual(cells[0]);
    expect(cells[2]).toEqual(cells[0]);
    expect(cells[0].slice(0, 6)).toEqual(['cover', 'name', 'artist', 'album', 'format', 'duration']);
  });

  it('shows the country of a station where a track has its artist', () => {
    renderView([played(stationFavourite(station))]);

    expect(document.querySelector('.artist')?.textContent).toBe('Hungary');
  });

  it('shows the format of a track and of a station', () => {
    renderView([played(stationFavourite(station)), played(trackFavourite({ ...track, codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }))]);

    // the station is in the list of stations as well
    expect(screen.getAllByText('MP3 128')).toHaveLength(2);
    expect(screen.getByText('FLAC 24/96')).toBeTruthy();
  });

  it('highlights the row that plays, the station among them', () => {
    renderView([played(stationFavourite(station)), played(trackFavourite(track))], toRadioTrack(station));

    expect(Array.from(document.querySelectorAll('.current')).map((row) => row.querySelector('.name')?.textContent)).toEqual(['Jazz FM']);
  });

  it('shows the logo of a station in its tile, and the radio icon for one without', () => {
    renderView([played(stationFavourite({ ...station, hasLogo: true })), played(stationFavourite({ ...station, uuid: 'other', name: 'Rock FM' }))]);

    const tiles = Array.from(document.querySelectorAll('button[title="Play"]'));
    expect(tiles.map((tile) => tile.querySelector('img')?.getAttribute('src')?.includes('/radio-logo/abc'))).toEqual([true, undefined]);
  });

  it('plays a station as the radio plays it', () => {
    const { playStation, playTracks } = renderView([played(stationFavourite(station))]);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(playStation).toHaveBeenCalledWith(station);
    expect(playTracks).not.toHaveBeenCalled();
  });

  it('plays a track on a double click', async () => {
    const { playTracks } = renderView([played(trackFavourite(track))]);

    fireEvent.doubleClick(screen.getByText('One'));

    await waitFor(() => expect(playTracks).toHaveBeenCalledWith([track]));
  });

  it('shows an item that is gone as not available, and does not play it', () => {
    const { playStation, playTracks } = renderView([played(trackFavourite(track), false), played(stationFavourite(station), false)]);

    const button = screen.getAllByRole('button', { name: 'Play' });
    button.forEach((item) => fireEvent.click(item));
    fireEvent.doubleClick(screen.getByText('One'));

    expect(screen.getAllByText('Not available')).toHaveLength(2);
    expect(button.every((item) => item.hasAttribute('disabled'))).toBe(true);
    expect(playTracks).not.toHaveBeenCalled();
    expect(playStation).not.toHaveBeenCalled();
  });

  it('clears the history only after it is confirmed', () => {
    const { clearHistory } = renderView([played(trackFavourite(track))]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(clearHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(clearHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(clearHistory).toHaveBeenCalledTimes(1);
  });
  describe('continue listening', () => {
    it('offers the paused track with its position, and resumes it', () => {
      const { resume } = renderView([], track, { isPlaying: false, currentTime: 30 });

      expect(screen.getByText('Continue listening')).toBeTruthy();
      expect(screen.getByText('One')).toBeTruthy();
      expect(screen.getByText('Artist · Record')).toBeTruthy();
      expect(screen.getByText('00:00:30')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      expect(resume).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['while a track plays', track, true],
      ['without a track', null, false],
    ])('is not offered %s', (_when, currentSong, isPlaying) => {
      renderView([], currentSong, { isPlaying });

      expect(screen.queryByText('Continue listening')).toBeNull();
    });

    it('shows a station by its name without a position', () => {
      renderView([], toRadioTrack(station), { isPlaying: false });

      expect(screen.getByText('Jazz FM')).toBeTruthy();
      expect(screen.getByText('Radio station')).toBeTruthy();
      expect(document.querySelector('.position')).toBeNull();
    });
  });

  describe('start tiles', () => {
    it('plays the liked tracks, and counts only the ones that are available', async () => {
      const other: Track = { ...track, path: '/music/b.flac', title: 'Two' };
      const { playTracks } = renderView([], null, {
        favourites: [liked(trackFavourite(track)), liked(trackFavourite(other)), liked(trackFavourite({ ...track, path: '/gone.flac' }), false)],
      });

      expect(screen.getByText('2 tracks')).toBeTruthy();
      fireEvent.click(screen.getByText('Liked'));

      await waitFor(() => expect(playTracks).toHaveBeenCalledWith([track, other]));
    });

    it('has no liked tile without a liked track', () => {
      renderView([], null, { favourites: [liked(stationFavourite(station))] });

      expect(screen.queryByText('Liked')).toBeNull();
    });

    it('plays a playlist, and skips the ones with nothing to play', async () => {
      const { playTracks } = renderView([], null, { playlists: [playlistOf(1, 'Empty', []), playlistOf(2, 'Road', [track])] });

      expect(screen.queryByText('Empty')).toBeNull();
      expect(screen.getByText('1 track')).toBeTruthy();
      fireEvent.click(screen.getByText('Road'));

      await waitFor(() => expect(playTracks).toHaveBeenCalledWith([track]));
    });

    it('shows the liked tile first and four tiles at most', () => {
      renderView([], null, {
        favourites: [liked(trackFavourite(track))],
        playlists: [1, 2, 3, 4, 5].map((id) => playlistOf(id, `List ${id}`, [track])),
      });

      expect(Array.from(document.querySelectorAll('.startName')).map((name) => name.textContent)).toEqual(['Liked', 'List 1', 'List 2', 'List 3']);
    });
  });

  describe('radio stations', () => {
    const other: RadioStation = { ...station, uuid: 'def', name: 'Classic FM' };

    it('lists the favourite stations before the ones that were played, each once', () => {
      renderView([played(stationFavourite(station)), played(stationFavourite(other))], null, {
        favourites: [liked(stationFavourite(other)), liked(stationFavourite(station))],
      });

      expect(Array.from(document.querySelectorAll('.stationName')).map((name) => name.textContent)).toEqual(['Classic FM', 'Jazz FM']);
    });

    it('leaves out a station that is not available', () => {
      renderView([played(stationFavourite(station), false)]);

      expect(document.querySelector('.stationName')).toBeNull();
    });

    it('plays a station on click', () => {
      const { playStation } = renderView([], null, { favourites: [liked(stationFavourite(station))] });

      fireEvent.click(screen.getByText('Jazz FM'));

      expect(playStation).toHaveBeenCalledWith(station);
    });

    it('keeps the format under the name, with the country, so a narrow tile does not squeeze the name out', () => {
      renderView([], null, { favourites: [liked(stationFavourite(station))] });

      const details = document.querySelector('.stationDetails');
      expect(details?.textContent).toBe('HungaryMP3 128');
      expect(details?.previousElementSibling?.className).toBe('stationName');
    });

    it('has no section without a station', () => {
      renderView([played(trackFavourite(track))]);

      expect(screen.queryByText('Radio stations')).toBeNull();
    });
  });

  describe('empty library', () => {
    it('points at adding a folder', () => {
      const { addFolder } = renderView([], null, { hasFolders: false });

      expect(screen.getByText('Your library is empty')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Add a folder' }));

      expect(addFolder).toHaveBeenCalledTimes(1);
    });

    it('says nothing while the library has folders', () => {
      renderView([]);

      expect(screen.queryByText('Your library is empty')).toBeNull();
    });
  });
});
