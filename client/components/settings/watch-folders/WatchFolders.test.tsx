import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WatchFolders from './WatchFolders';

describe('WatchFolders', () => {
  it('says that changes are picked up without a rescan, and turns the watching off', () => {
    const setEnabled = vi.fn();
    render(<WatchFolders enabled setEnabled={setEnabled} />);

    expect(screen.getByText(/are picked up without a rescan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Watch library folders' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says that Rescan picks up changes while it is off, and turns the watching on', () => {
    const setEnabled = vi.fn();
    render(<WatchFolders enabled={false} setEnabled={setEnabled} />);

    expect(screen.getByText(/are not watched/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Watch library folders' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });
});
