import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Album } from '@shared/types/library';
import { getCoverUrl } from '../../../utils/cover-url';
import { getImageTint } from '../../../utils/cover-tint';
import AlbumDetails from './AlbumDetails';

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

const addToQueue = vi.fn();
const baseProps = { playTracks: vi.fn(), addToQueue, close: vi.fn() };
const setup = (shown: Album) => render(<AlbumDetails album={shown} {...baseProps} />);

describe('AlbumDetails', () => {
  it('is a modal dialog named by the album, with the focus inside it', () => {
    render(<AlbumDetails album={album} {...baseProps} />);

    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  afterEach(() => {
    vi.mocked(getImageTint).mockReset();
    addToQueue.mockReset();
  });

  it('shows the same cover as the thumbnail', () => {
    setup(album);

    expect(screen.getByRole('img').getAttribute('src')).toBe(getCoverUrl('/data/albumart/abc123.jpg'));
  });

  it('shows the cover only once it has loaded', () => {
    setup(album);
    const image = screen.getByRole('img');
    expect(image.className).not.toContain('loaded');

    fireEvent.load(image);

    expect(image.className).toContain('loaded');
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
    render(<AlbumDetails album={album} {...baseProps} playTracks={playTracks} close={vi.fn()} />);

    fireEvent.click(screen.getByText('Play album'));

    expect(playTracks).toHaveBeenCalledWith(album.tracks);
  });

  it('adds the tracks of the album, or one of them, to the queue', async () => {
    setup(album);
    const albumButton = screen.getByRole('button', { name: 'Add to queue' });
    const trackButton = screen.getByRole('button', { name: 'Add to the queue' });

    fireEvent.click(albumButton);
    await waitFor(() => expect(addToQueue).toHaveBeenLastCalledWith(album.tracks, false));
    fireEvent.click(trackButton);
    await waitFor(() => expect(addToQueue).toHaveBeenCalledTimes(2));

    expect(addToQueue).toHaveBeenLastCalledWith([album.tracks![0]], false);
  });

  it('puts the tracks of the album, or one of them, next', async () => {
    setup(album);
    const [albumButton, trackButton] = screen.getAllByRole('button', { name: 'Play next' });

    fireEvent.click(albumButton);
    await waitFor(() => expect(addToQueue).toHaveBeenLastCalledWith(album.tracks, true));
    fireEvent.click(trackButton);
    await waitFor(() => expect(addToQueue).toHaveBeenCalledTimes(2));

    expect(addToQueue).toHaveBeenLastCalledWith([album.tracks![0]], true);
  });

  it('shows what the slots give, with the classes that place it, and nothing without them', () => {
    const { rerender } = render(<AlbumDetails album={album} {...baseProps} />);
    expect(screen.queryByText('actions')).toBeNull();

    rerender(
      <AlbumDetails
        album={album}
        {...baseProps}
        renderActions={(shown, slot) => <i>{`actions ${shown.id} ${slot.favouriteClass.length > 0} ${slot.playlistClass.length > 0}`}</i>}
        renderCoverMenu={(shown) => <i>{`cover menu ${shown.id}`}</i>}
      />
    );

    expect(screen.getByText('actions a1 true true')).toBeTruthy();
    expect(screen.getByText('cover menu a1')).toBeTruthy();
  });

  it('tints the header with the color of the loaded cover', () => {
    vi.mocked(getImageTint).mockReturnValue('rgb(40, 20, 10)');
    setup(album);

    fireEvent.load(screen.getByRole('img'));

    expect(screen.getByRole('button', { name: 'Back to the albums' }).parentElement?.getAttribute('style')).toContain('rgb(40, 20, 10)');
  });

  it('keeps the default header when the cover cannot be read', () => {
    vi.mocked(getImageTint).mockReturnValue(undefined);
    setup(album);

    fireEvent.load(screen.getByRole('img'));

    expect(screen.getByRole('button', { name: 'Back to the albums' }).parentElement?.getAttribute('style')).toBeNull();
  });

  it('shows nothing while no album is open', () => {
    const { container } = render(<AlbumDetails album={null} {...baseProps} playTracks={vi.fn()} close={vi.fn()} />);

    expect(container.children).toHaveLength(0);
  });

  it('goes back with the button on top, and not with a click inside the page', () => {
    const close = vi.fn();
    render(<AlbumDetails album={album} {...baseProps} playTracks={vi.fn()} close={close} />);

    fireEvent.click(screen.getByText('One'));
    expect(close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to the albums' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('leaves an Escape that something else used, as the menu of the cover that closes with it', () => {
    const close = vi.fn();
    render(<AlbumDetails album={album} {...baseProps} playTracks={vi.fn()} close={close} />);

    const used = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    used.preventDefault();
    document.dispatchEvent(used);

    expect(close).not.toHaveBeenCalled();
  });

  it('closes with Escape while an album is open, and listens no more once it is closed', () => {
    const close = vi.fn();
    const { rerender } = render(<AlbumDetails album={album} {...baseProps} playTracks={vi.fn()} close={close} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);

    rerender(<AlbumDetails album={null} {...baseProps} playTracks={vi.fn()} close={close} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
