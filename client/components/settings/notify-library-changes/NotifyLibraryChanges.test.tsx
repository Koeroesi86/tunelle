import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NotifyLibraryChanges from './NotifyLibraryChanges';

describe('NotifyLibraryChanges', () => {
  it('says that a notification tells about the scans, and turns it off', () => {
    const setEnabled = vi.fn();
    render(<NotifyLibraryChanges enabled setEnabled={setEnabled} />);

    expect(screen.getByText(/A notification tells you/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Library notifications' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says that nothing is told while it is off, and turns it on', () => {
    const setEnabled = vi.fn();
    render(<NotifyLibraryChanges enabled={false} setEnabled={setEnabled} />);

    expect(screen.getByText(/not told/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Library notifications' }));
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });
});
