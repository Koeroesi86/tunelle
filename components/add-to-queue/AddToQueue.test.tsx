import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import AddToQueue from './AddToQueue';

const track: Track = {
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
};

describe('AddToQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds the tracks it fetches and says so', async () => {
    const add = vi.fn();
    render(<AddToQueue getTracks={() => Promise.resolve([track])} add={add} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to the queue' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Added to the queue' })).toBeTruthy());
    expect(add).toHaveBeenCalledWith([track]);
  });

  it('goes back to its first look after a moment', async () => {
    vi.useFakeTimers();
    render(<AddToQueue getTracks={() => Promise.resolve([track])} add={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Added to the queue' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByRole('button', { name: 'Add to the queue' })).toBeTruthy();
  });

  it('adds nothing and does not say so when the tracks cannot be fetched', async () => {
    const add = vi.fn();
    const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AddToQueue getTracks={() => Promise.reject(new Error('gone'))} add={add} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add to the queue' })).toBeTruthy();
    failed.mockRestore();
  });

  it('does not select or play the row it sits in', () => {
    const row = vi.fn();
    render(
      <div onClick={row} onDoubleClick={row}>
        <AddToQueue getTracks={() => Promise.resolve([])} add={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.doubleClick(screen.getByRole('button'));

    expect(row).not.toHaveBeenCalled();
  });

  it('shows the words next to the icon when asked to', () => {
    render(<AddToQueue withLabel getTracks={() => Promise.resolve([])} add={vi.fn()} />);

    expect(screen.getByText('Add to queue')).toBeTruthy();
  });

  it('puts the tracks next with its own words when asked to', async () => {
    const add = vi.fn();
    render(<AddToQueue next withLabel getTracks={() => Promise.resolve([track])} add={add} />);

    expect(screen.getByText('Play next')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Playing next' })).toBeTruthy());
    expect(add).toHaveBeenCalledWith([track]);
  });
});
