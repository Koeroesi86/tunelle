import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Favourite } from '@shared/types/favourites';
import type { Track } from '@shared/types/library';
import type { RadioStation } from '@shared/types/radio';
import { albumFavourite, stationFavourite, trackFavourite } from '../../client/utils/favourites';
import type { FavouritesOrder, FavouritesSource } from '../../client/redux/types';
import FavouritesView from './FavouritesView';

vi.mock('../favourite-button', () => ({ default: () => null }));
const queued = vi.hoisted(() => vi.fn());
vi.mock('../add-to-queue', async () => {
  const { createElement } = await import('react');

  return {
    default: ({ getTracks, next }: { getTracks: () => Promise<unknown[]>; next?: boolean }) =>
      createElement('button', { 'aria-label': next ? 'Play next' : 'Add to the queue', onClick: () => void getTracks().then(queued) }),
  };
});

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
  duration: 10,
};
const station: RadioStation = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
const album = { id: '/music - Album', title: 'Album', path: '/music', artist: 'Artist', cover: null, duration: 20, year: 2020, trackCount: 2 };

type ViewProps = Parameters<typeof FavouritesView>[0];

/** Keeps the choices the way the store does */
const StatefulView = (props: Omit<ViewProps, 'source' | 'order' | 'setSource' | 'setOrder'>) => {
  const [source, setSource] = useState<FavouritesSource>('local');
  const [order, setOrder] = useState<FavouritesOrder>('recent');
  return <FavouritesView {...props} source={source} order={order} setSource={setSource} setOrder={setOrder} />;
};

const stored = (item: ReturnType<typeof trackFavourite>, available = true, addedAt = 1): Favourite => ({ ...item, addedAt, available });
const openOnline = () => fireEvent.click(screen.getByRole('button', { name: /Online/ }));

describe('FavouritesView', () => {
  afterEach(() => {
    queued.mockReset();
    vi.unstubAllGlobals();
  });

  const renderView = (favourites: Favourite[], playTracks = vi.fn(), playStation = vi.fn()) => {
    render(<StatefulView favourites={favourites} playTracks={playTracks} playStation={playStation} />);
    return { playTracks, playStation };
  };

  it('shows the format of a track and of a station, and none of an album', () => {
    renderView([stored(trackFavourite({ ...track, codec: 'FLAC', lossless: 1, bitDepth: 16, sampleRate: 44100 })), stored(albumFavourite(album))]);

    expect(screen.getByText('FLAC 16/44.1')).toBeTruthy();
    expect(document.querySelectorAll('.badge')).toHaveLength(1);

    openOnline();
    cleanup();
    renderView([stored(stationFavourite(station))]);
    openOnline();
    expect(screen.getByText('MP3 128')).toBeTruthy();
  });

  it('adds the track of a favourite to the queue, and offers it for neither a station nor an unavailable one', async () => {
    renderView([stored(trackFavourite(track)), stored(trackFavourite({ ...track, path: '/music/b.flac' }), false)]);

    const buttons = screen.getAllByRole('button', { name: 'Add to the queue' });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(queued).toHaveBeenCalledWith([track]));

    cleanup();
    renderView([stored(stationFavourite(station))]);
    openOnline();
    expect(screen.queryAllByRole('button', { name: 'Add to the queue' })).toHaveLength(0);
  });

  it('tells that nothing is marked yet, and offers nothing to play', () => {
    renderView([]);

    expect(screen.getByText(/Nothing is marked yet/)).toBeTruthy();
    expect(['Play all local', 'Shuffle'].every((name) => screen.getByRole('button', { name }).hasAttribute('disabled'))).toBe(true);
  });

  it('lists the tracks and albums under Local and the stations under Online, with the totals of the open side', () => {
    renderView([stored(trackFavourite(track)), stored(albumFavourite(album)), stored(stationFavourite(station))]);

    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Artist · Record')).toBeTruthy();
    expect(screen.getByText('Artist · Album')).toBeTruthy();
    expect(screen.queryByText('Jazz FM')).toBeNull();
    expect(['2 items', '1 track', '1 album'].map((text) => screen.queryByText(text) !== null)).toEqual([true, true, true]);
    expect(screen.getByRole('button', { name: /Local/ }).getAttribute('aria-pressed')).toBe('true');

    openOnline();

    expect(screen.getByText('Jazz FM')).toBeTruthy();
    expect(screen.getByText('Hungary · jazz')).toBeTruthy();
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.getByText('1 station')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play all online' })).toBeTruthy();
  });

  it('plays a single station as the radio plays it', () => {
    const { playStation, playTracks } = renderView([stored(stationFavourite(station))]);
    openOnline();

    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0]);

    expect(playStation).toHaveBeenCalledWith(station);
    expect(playTracks).not.toHaveBeenCalled();
  });

  it('plays all the local favourites, the tracks of an album among them, in the order of the list', async () => {
    const albumTracks = [
      { ...track, path: '/music/b.flac' },
      { ...track, path: '/music/c.flac' },
    ];
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(albumTracks)));
    const { playTracks } = renderView([stored(trackFavourite(track), true, 3), stored(albumFavourite(album), true, 2), stored(stationFavourite(station))]);

    fireEvent.click(screen.getByRole('button', { name: 'Play all local' }));

    await waitFor(() => expect(playTracks).toHaveBeenCalled());
    expect(playTracks.mock.calls[0][0].map(({ path }: Track) => path)).toEqual(['/music/a.flac', '/music/b.flac', '/music/c.flac']);
  });

  it('shuffles the tracks of the open side', async () => {
    const tracks = Array.from({ length: 8 }, (_, index) => ({ ...track, path: `/music/${index}.flac`, title: `Song ${index}` }));
    const { playTracks } = renderView(tracks.map((item, index) => stored(trackFavourite(item), true, 100 - index)));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));

    await waitFor(() => expect(playTracks).toHaveBeenCalled());
    random.mockRestore();
    const played = playTracks.mock.calls[0][0].map(({ path }: Track) => path);
    expect(played).not.toEqual(tracks.map(({ path }) => path));
    expect(played.toSorted()).toEqual(tracks.map(({ path }) => path).toSorted());
  });

  it.each([
    ['Recently liked', ['Charlie', 'Alpha', 'Bravo']],
    ['Name', ['Alpha', 'Bravo', 'Charlie']],
    ['Artist or country', ['Bravo', 'Charlie', 'Alpha']],
  ])('orders by %s', (label, names) => {
    const item = (title: string, artist: string, addedAt: number) => stored(trackFavourite({ ...track, path: `/${title}`, title, artist }), true, addedAt);
    renderView([item('Alpha', 'Zed', 2), item('Bravo', 'Abe', 1), item('Charlie', 'Max', 3)]);

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: { 'Recently liked': 'recent', Name: 'name', 'Artist or country': 'details' }[label] },
    });

    expect(Array.from(document.querySelectorAll('.name')).map((name) => name.textContent)).toEqual(names);
  });

  it('says when it was liked: today and days ago at first, the date later', () => {
    const now = Date.now();
    renderView([
      stored(trackFavourite(track), true, now),
      stored(trackFavourite({ ...track, path: '/b' }), true, now - 3 * 86_400_000),
      stored(trackFavourite({ ...track, path: '/c' }), true, 1),
    ]);

    expect(screen.getByText('today')).toBeTruthy();
    expect(screen.getByText('3 days ago')).toBeTruthy();
    expect(screen.getByText(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(1))).toBeTruthy();
  });

  it('collects the items that are gone under their own heading with the note, and does not play them', () => {
    const { playTracks } = renderView([stored(trackFavourite(track), false, 5), stored(trackFavourite({ ...track, path: '/b', title: 'Two' }), true, 1)]);

    expect(screen.getByText('1 not available')).toBeTruthy();
    expect(screen.getByText(/follows the path of its file/)).toBeTruthy();
    const names = Array.from(document.querySelectorAll('.name')).map((name) => name.textContent);
    expect(names).toEqual(['Two', 'One']);
    const buttons = screen.getAllByRole('button', { name: 'Play' });
    buttons.forEach((button) => fireEvent.click(button));
    screen.getAllByText('One').forEach((name) => fireEvent.doubleClick(name));

    expect(buttons[1].hasAttribute('disabled')).toBe(true);
    expect(playTracks).not.toHaveBeenCalled();
  });

  it('shows a station that is gone as not available without the note about files', () => {
    const { playStation } = renderView([stored(stationFavourite(station), false)]);
    openOnline();

    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.queryByText(/follows the path of its file/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(playStation).not.toHaveBeenCalled();
  });

  it('says that a side is empty while the other has items', () => {
    renderView([stored(trackFavourite(track))]);
    openOnline();

    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});
