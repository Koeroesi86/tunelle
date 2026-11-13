import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Album } from '@shared/types/library';
import { getCoverUrl } from '../../../utils/cover-url';
import { getImageTint } from '../../../utils/cover-tint';
import AlbumDetails from './AlbumDetails';

vi.mock('../../ui/favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-playlist', () => ({ default: () => null }));
vi.mock('../album-cover-menu', () => ({ default: () => null }));
const queued = vi.hoisted(() => vi.fn());
vi.mock('../add-to-queue', async () => {
  const { createElement } = await import('react');

  return {
    default: ({ getTracks, next }: { getTracks: () => Promise<unknown[]>; next?: boolean }) =>
      createElement('button', { 'aria-label': next ? 'Play next' : 'Add to the queue', onClick: () => void getTracks().then(queued) }),
  };
});
vi.mock('../../../utils/cover-tint', () => ({ getImageTint: vi.fn() }));

const album: Album = {
  id: 'a1',
  title: 'Title',
  path: '/music/a1',
  artist: 'Artist',
  cover: '/data/albumart/abc123.jpg',
  duration: 125,
  year: 2019,
  tracks: [{ path: '/music/a1/1.flac', artist: 'Artist', album: 'Title', title: 'One', year: 2019, track: 1, disk: 1, genre: '', picture: null, duration: 65 }],
};

const setup = (shown: Album) => render(<AlbumDetails album={shown} playTracks={vi.fn()} close={vi.fn()} />);

describe('AlbumDetails', () => {
  afterEach(() => {
    vi.mocked(getImageTint).mockReset();
    queued.mockReset();
  });

  it('shows the same cover as the thumbnail', () => {
    setup(album);

    expect(screen.getByRole('img').getAttribute('src')).toBe(getCoverUrl('/data/albumart/abc123.jpg'));
  });

  it('shows the format of each track', () => {
    setup({ ...album, tracks: [{ ...album.tracks![0], codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }] });

    expect(screen.getByText('FLAC 24/96')).toBeTruthy();
  });

  it('shows no image for an album without a cover', () => {
    setup({ ...album, cover: null });

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('drops the image when it fails to load, leaving the placeholder', () => {
    setup(album);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('plays the tracks of the album', () => {
    const playTracks = vi.fn();
    render(<AlbumDetails album={album} playTracks={playTracks} close={vi.fn()} />);

    fireEvent.click(screen.getByText('Play album'));

    expect(playTracks).toHaveBeenCalledWith(album.tracks);
  });

  it('adds the tracks of the album, or one of them, to the queue', async () => {
    setup(album);
    const [albumButton, trackButton] = screen.getAllByRole('button', { name: 'Add to the queue' });

    fireEvent.click(albumButton);
    await waitFor(() => expect(queued).toHaveBeenLastCalledWith(album.tracks));
    fireEvent.click(trackButton);
    await waitFor(() => expect(queued).toHaveBeenCalledTimes(2));

    expect(queued).toHaveBeenLastCalledWith([album.tracks![0]]);
  });

  it('puts the tracks of the album, or one of them, next', async () => {
    setup(album);
    const [albumButton, trackButton] = screen.getAllByRole('button', { name: 'Play next' });

    fireEvent.click(albumButton);
    await waitFor(() => expect(queued).toHaveBeenLastCalledWith(album.tracks));
    fireEvent.click(trackButton);
    await waitFor(() => expect(queued).toHaveBeenCalledTimes(2));

    expect(queued).toHaveBeenLastCalledWith([album.tracks![0]]);
  });

  it('tints the header with the color of the loaded cover', () => {
    vi.mocked(getImageTint).mockReturnValue('rgb(40, 20, 10)');
    setup(album);

    fireEvent.load(screen.getByRole('img'));

    expect(screen.getByRole('button', { name: 'Close' }).parentElement?.getAttribute('style')).toContain('rgb(40, 20, 10)');
  });

  it('keeps the default header when the cover cannot be read', () => {
    vi.mocked(getImageTint).mockReturnValue(undefined);
    setup(album);

    fireEvent.load(screen.getByRole('img'));

    expect(screen.getByRole('button', { name: 'Close' }).parentElement?.getAttribute('style')).toBeNull();
  });

  it('keeps showing the album while it closes', () => {
    const { rerender } = setup(album);

    rerender(<AlbumDetails album={null} playTracks={vi.fn()} close={vi.fn()} />);

    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toBe(getCoverUrl('/data/albumart/abc123.jpg'));
  });

  it('closes on a click outside the dialog, and not on a click inside it', () => {
    const close = vi.fn();
    const { container } = render(<AlbumDetails album={album} playTracks={vi.fn()} close={close} />);

    fireEvent.click(screen.getByText('One'));
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as Element);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('has no layer over the window while no album is open, so the title bar can drag it', () => {
    const { container, rerender } = render(<AlbumDetails album={null} playTracks={vi.fn()} close={vi.fn()} />);
    expect(container.children).toHaveLength(1);

    rerender(<AlbumDetails album={album} playTracks={vi.fn()} close={vi.fn()} />);
    expect(container.children).toHaveLength(2);
  });

  it('closes with Escape while an album is open, and listens no more once it is closed', () => {
    const close = vi.fn();
    const { rerender } = render(<AlbumDetails album={album} playTracks={vi.fn()} close={close} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);

    rerender(<AlbumDetails album={null} playTracks={vi.fn()} close={close} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
