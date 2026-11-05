import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AlbumSummary } from '@shared/types/library';
import AlbumViewThumbnail from './AlbumViewThumbnail';

vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-playlist', () => ({ default: () => null }));

const album: AlbumSummary = {
  id: '/music/night - Night Shift',
  title: 'Night Shift',
  path: '/music/night',
  artist: 'The Velvet Engine',
  cover: null,
  duration: 2892,
  year: 2021,
  trackCount: 9,
  codec: 'FLAC',
  lossless: 1,
  bitDepth: 24,
  sampleRate: 96000,
};

const renderTile = (props: Partial<Parameters<typeof AlbumViewThumbnail>[0]> = {}) =>
  render(<AlbumViewThumbnail album={album} offlineFolders={[]} selectAlbum={vi.fn()} playAlbum={vi.fn()} {...props} />);

describe('AlbumViewThumbnail', () => {
  it('shows the title and the artist, then the year, the number of tracks and the length', () => {
    renderTile();

    expect(screen.getByText('Night Shift')).toBeTruthy();
    expect(screen.getByText('The Velvet Engine')).toBeTruthy();
    expect(screen.getByText('2021 · 9 tracks · 48:12')).toBeTruthy();
  });

  it('has the line without the tracks for a cover too narrow to hold them', () => {
    renderTile();

    expect(screen.getByText('2021 · 48:12')).toBeTruthy();
  });

  it('says one track in the singular and leaves out a year that is not known', () => {
    renderTile({ album: { ...album, year: '', trackCount: 1, duration: 61 } });

    expect(screen.getByText('1 track · 1:01')).toBeTruthy();
  });

  it('badges the format of the album', () => {
    renderTile();
    expect(screen.getByText('Hi-Res')).toBeTruthy();

    cleanup();
    renderTile({ album: { ...album, bitDepth: 16, sampleRate: 44100 } });
    expect(screen.getByText('FLAC')).toBeTruthy();
  });

  it('has no badge for an album whose format is not known', () => {
    const { container } = renderTile({ album: { ...album, codec: null } });

    expect(container.querySelector('[class*="format"]')).toBeNull();
  });

  it('opens the album on a click, and plays it on a double click', () => {
    const selectAlbum = vi.fn();
    const playAlbum = vi.fn();
    const { container } = renderTile({ selectAlbum, playAlbum });

    fireEvent.click(container.firstElementChild as Element);
    fireEvent.doubleClick(container.firstElementChild as Element);

    expect(selectAlbum).toHaveBeenCalledWith(album);
    expect(playAlbum).toHaveBeenCalledWith(album);
  });

  it('plays the album from the play button without opening it', () => {
    const selectAlbum = vi.fn();
    const playAlbum = vi.fn();
    renderTile({ selectAlbum, playAlbum });

    fireEvent.click(screen.getByRole('button', { name: 'Play Night Shift' }));

    expect(playAlbum).toHaveBeenCalledTimes(1);
    expect(selectAlbum).not.toHaveBeenCalled();
  });

  it('says that the folder cannot be reached for an album of an offline folder', () => {
    const { container } = renderTile({ offlineFolders: ['/music'] });

    expect((container.firstElementChild as HTMLElement).title).toMatch(/cannot be reached/);
  });

  it('gives the shadow the colour of the cover when it has one', () => {
    const { container, rerender } = render(
      <AlbumViewThumbnail album={{ ...album, accent: '#2878dc' }} offlineFolders={[]} selectAlbum={vi.fn()} playAlbum={vi.fn()} />
    );
    const frame = () => container.querySelector<HTMLElement>('.frame, [class*="frame"]');

    expect(frame()?.style.getPropertyValue('--tile-shadow')).toBe('#2878dc8c');

    rerender(<AlbumViewThumbnail album={album} offlineFolders={[]} selectAlbum={vi.fn()} playAlbum={vi.fn()} />);
    expect(frame()?.style.getPropertyValue('--tile-shadow')).toBe('');
  });
});
