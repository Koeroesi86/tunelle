import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '../../types/library';
import NowPlaying from './NowPlaying';

vi.mock('../favourite-button', () => ({ default: () => null }));

const flac: Track = {
  path: '/music/1.flac',
  artist: 'Artist',
  album: 'Album',
  title: 'One',
  year: 2020,
  track: 1,
  disk: 1,
  genre: '',
  picture: null,
  duration: 60,
  codec: 'FLAC',
  lossless: 1,
  bitDepth: 16,
  sampleRate: 44100,
};
const mp3: Track = {
  ...flac,
  path: '/music/2.mp3',
  title: 'Two',
  track: 2,
  duration: 125,
  codec: 'MP3',
  lossless: 0,
  bitrate: 320000,
  bitDepth: null,
  sampleRate: null,
};

const renderPage = (props: Partial<Parameters<typeof NowPlaying>[0]> = {}) =>
  render(
    <NowPlaying
      nowPlaying={[flac, mp3]}
      currentSong={flac}
      streamTitle={null}
      streamArt={null}
      isPlaying
      playTrack={vi.fn()}
      moveTrack={vi.fn()}
      removeTrack={vi.fn()}
      clearQueue={vi.fn()}
      openLibrary={vi.fn()}
      {...props}
    />
  );

describe('NowPlaying', () => {
  it('shows the format of the current song and of each track of the list', () => {
    renderPage();

    expect(screen.getAllByText('FLAC 16/44.1')).toHaveLength(2);
    expect(screen.getByText('MP3 320')).toBeTruthy();
  });

  it('plays a track from the button that replaces its number', () => {
    const playTrack = vi.fn();
    renderPage({ playTrack });

    fireEvent.click(screen.getByRole('button', { name: 'Play Two' }));

    expect(playTrack).toHaveBeenCalledWith(mp3);
  });

  it('still plays a track on a double click of its row', () => {
    const playTrack = vi.fn();
    renderPage({ playTrack });

    fireEvent.doubleClick(screen.getByTitle('#2 Two'));

    expect(playTrack).toHaveBeenCalledWith(mp3);
  });

  it('shows the number of the other tracks and a meter instead of the number of the current one', () => {
    renderPage();
    const [first, second] = screen.getAllByRole('button', { name: /^Play / }).map((button) => button.previousElementSibling);

    expect(first?.querySelector('i')).not.toBeNull();
    expect(first?.textContent).toBe('');
    expect(second?.textContent).toBe('2');
  });

  it('numbers the rows by their place in the queue, not by the number of the track on its album', () => {
    renderPage({
      nowPlaying: [
        { ...mp3, track: 9 },
        { ...flac, track: 5 },
      ],
      currentSong: null,
    });
    const numbers = screen.getAllByRole('button', { name: /^Play / }).map((button) => button.previousElementSibling?.textContent);

    expect(numbers).toEqual(['1', '2']);
    expect(screen.getByTitle('#2 One')).toBeTruthy();
  });

  it('stops the meter while paused', () => {
    const { container, rerender } = renderPage({ isPlaying: false });

    expect(container.querySelector('[class*="paused"]')).not.toBeNull();

    rerender(
      <NowPlaying
        nowPlaying={[flac, mp3]}
        currentSong={flac}
        streamTitle={null}
        streamArt={null}
        isPlaying
        playTrack={vi.fn()}
        moveTrack={vi.fn()}
        removeTrack={vi.fn()}
        clearQueue={vi.fn()}
        openLibrary={vi.fn()}
      />
    );

    expect(container.querySelector('[class*="paused"]')).toBeNull();
  });

  it('counts the tracks and adds up their length', () => {
    renderPage();

    expect(screen.getByText('Up next · 2 tracks')).toBeTruthy();
    expect(screen.getByText('00:03:05')).toBeTruthy();
  });

  it('shows the length of each track', () => {
    renderPage();

    expect(screen.getByText('00:01:00')).toBeTruthy();
    expect(screen.getByText('00:02:05')).toBeTruthy();
  });

  it('puts the current track in the middle of the list when it opens', () => {
    const heights = { offsetTop: 300, clientHeight: 100, offsetHeight: 40 } as const;
    const originals = Object.entries(heights).map(([name]) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const);
    Object.entries(heights).forEach(([name, value]) => Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value }));

    try {
      const { container } = renderPage({ currentSong: mp3 });

      expect(container.querySelector('[class*="tracks"]')?.scrollTop).toBe(270);
    } finally {
      originals.forEach(([name, descriptor]) => descriptor && Object.defineProperty(HTMLElement.prototype, name, descriptor));
    }
  });

  it('removes the track of a row from the queue', () => {
    const removeTrack = vi.fn();
    renderPage({ removeTrack });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Two from the queue' }));

    expect(removeTrack).toHaveBeenCalledWith(1);
  });

  it('keeps the song that plays in the queue', () => {
    renderPage();

    expect((screen.getByRole('button', { name: 'Remove One from the queue' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Remove Two from the queue' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('moves a track to the place of the row it is dropped on', () => {
    const moveTrack = vi.fn();
    renderPage({ moveTrack });
    const [first, second] = [screen.getByTitle('#1 One'), screen.getByTitle('#2 Two')];

    fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    fireEvent.dragOver(second);
    fireEvent.drop(second);

    expect(moveTrack).toHaveBeenCalledWith(0, 1);
  });

  it.each([
    ['ArrowDown', 0, 1],
    ['ArrowUp', 1, 0],
  ])('moves the row that has the focus with Alt and %s', (key, from, to) => {
    const moveTrack = vi.fn();
    renderPage({ moveTrack });

    fireEvent.keyDown(screen.getByTitle(`#${from + 1} ${from ? 'Two' : 'One'}`), { key, altKey: true });

    expect(moveTrack).toHaveBeenCalledWith(from, to);
  });

  it('gives the focus back to the row once it has moved', () => {
    const moveTrack = vi.fn();
    const { rerender } = renderPage({ moveTrack });

    fireEvent.keyDown(screen.getByTitle('#1 One'), { key: 'ArrowDown', altKey: true });
    rerender(
      <NowPlaying
        nowPlaying={[mp3, flac]}
        currentSong={flac}
        streamTitle={null}
        streamArt={null}
        isPlaying
        playTrack={vi.fn()}
        moveTrack={moveTrack}
        removeTrack={vi.fn()}
        clearQueue={vi.fn()}
        openLibrary={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(screen.getByTitle('#2 One'));
  });

  it('does not move a row for the arrow keys alone, or from a button inside it', () => {
    const moveTrack = vi.fn();
    renderPage({ moveTrack });

    fireEvent.keyDown(screen.getByTitle('#1 One'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove Two from the queue' }), { key: 'ArrowUp', altKey: true });

    expect(moveTrack).not.toHaveBeenCalled();
  });

  it('clears the queue on the second click, and asks first', () => {
    const clearQueue = vi.fn();
    renderPage({ clearQueue });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clearQueue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Clear the queue?' }));
    expect(clearQueue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('forgets the question when the button loses the focus', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Clear the queue?' }));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('can clear a queue of the song that plays alone, as that stops it', () => {
    renderPage({ nowPlaying: [flac] });

    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a message and a way into the library when nothing is loaded', () => {
    const openLibrary = vi.fn();
    renderPage({ nowPlaying: [], currentSong: null, openLibrary });

    expect(screen.getByText('Nothing is playing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open library' }));

    expect(openLibrary).toHaveBeenCalledTimes(1);
  });
});
