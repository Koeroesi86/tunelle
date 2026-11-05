import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArtistPhotos from './ArtistPhotos';

describe('ArtistPhotos', () => {
  it('says that the names of the artists are sent to Deezer, and shows it on', () => {
    const setEnabled = vi.fn();
    render(<ArtistPhotos enabled setEnabled={setEnabled} />);

    expect(screen.getByText(/names of the artists in your library are sent to Deezer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Artist photos' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says that nothing is sent while it is off, and shows it off', () => {
    const setEnabled = vi.fn();
    render(<ArtistPhotos enabled={false} setEnabled={setEnabled} />);

    expect(screen.getByText(/not sent anywhere/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Artist photos' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });
});
