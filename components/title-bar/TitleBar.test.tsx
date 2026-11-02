import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '../../types/library';
import TitleBar from './TitleBar';

vi.mock('../audio-spectrum', () => ({ default: () => <canvas data-testid="spectrum" /> }));
vi.mock('../window-controls', () => ({ default: () => <div data-testid="window-controls" /> }));

const track: Track = {
  path: '/music/1.flac',
  artist: 'The Velvet Engine',
  album: 'Night Shift',
  title: 'Neon Rain',
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

describe('TitleBar', () => {
  it('shows the icon of the app before the wordmark', () => {
    const { container } = render(<TitleBar />);
    const wordmark = screen.getByRole('img', { name: 'Tunelle' });

    expect(container.querySelector('img')?.getAttribute('src')).toContain('svg');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.compareDocumentPosition(wordmark)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('holds the window controls', () => {
    render(<TitleBar />);

    expect(screen.getByTestId('window-controls')).toBeTruthy();
  });

  it('shows no track while nothing plays', () => {
    render(<TitleBar />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('spectrum')).toBeNull();
  });

  it('shows a small spectrum in the track while it plays', () => {
    render(<TitleBar currentSong={track} />);

    expect(screen.getByRole('button', { name: /Neon Rain/ }).querySelector('[data-testid="spectrum"]')).not.toBeNull();
  });

  it('shows the track that plays and opens the now playing page with it', () => {
    const openNowPlaying = vi.fn();
    render(<TitleBar currentSong={track} openNowPlaying={openNowPlaying} />);

    fireEvent.click(screen.getByRole('button', { name: /Neon Rain/ }));

    expect(screen.getByText('The Velvet Engine')).toBeTruthy();
    expect(openNowPlaying).toHaveBeenCalledOnce();
  });

  it('shows the song on air of a station instead of the station', () => {
    const station: Track = { ...track, path: 'radio://abc', title: 'Station', artist: '' };
    render(<TitleBar currentSong={station} streamTitle="Some Artist - On Air" />);

    expect(screen.getByRole('button', { name: /On Air/ })).toBeTruthy();
  });
});
