import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import TrackViewItem from './TrackViewItem';

const track: Track = {
  path: '/music/1.flac',
  artist: 'Artist',
  album: 'Album',
  title: 'One',
  year: 2019,
  track: 1,
  disk: 1,
  genre: '',
  picture: null,
  duration: 65,
};

describe('TrackViewItem actions', () => {
  it('shows the buttons the slot gives on the row of a track, and none on the header', () => {
    const renderActions = (shown: Track, slot: { heartClass: string; actionClass: string }) => (
      <i>{`actions ${shown.title} ${slot.heartClass.length > 0} ${slot.actionClass.length > 0}`}</i>
    );
    const { rerender } = render(<TrackViewItem track={track} renderActions={renderActions} />);
    expect(screen.getByText('actions One true true')).toBeTruthy();

    const labels = { duration: 'Duration', artist: 'Artist', year: 'Year', album: 'Album', track: '#', title: 'Title' };
    rerender(<TrackViewItem track={labels} isHeader renderActions={renderActions} />);
    expect(screen.queryByText(/^actions/)).toBeNull();
  });
});

describe('TrackViewItem keyboard', () => {
  it('plays on Enter and selects on Space', () => {
    const clickTrack = vi.fn();
    const doubleClickTrack = vi.fn();
    render(<TrackViewItem track={track} isTabStop clickTrack={clickTrack} doubleClickTrack={doubleClickTrack} />);
    const row = screen.getAllByRole('row')[0];

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });

    expect(doubleClickTrack).toHaveBeenCalledWith(track);
    expect(clickTrack).toHaveBeenCalledWith(track);
  });

  it('is reached by Tab only as the tab stop, and tells the list when it has the focus', () => {
    const focusTrack = vi.fn();
    const { rerender } = render(<TrackViewItem track={track} isTabStop focusTrack={focusTrack} />);
    const row = screen.getAllByRole('row')[0];

    expect(row.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(row);
    expect(focusTrack).toHaveBeenCalledWith(track);

    rerender(<TrackViewItem track={track} />);
    expect(screen.getAllByRole('row')[0].getAttribute('tabindex')).toBe('-1');
  });

  it('moves the focus to the next and the previous row with the arrow keys', () => {
    render(
      <div>
        <TrackViewItem track={track} />
        <TrackViewItem track={{ ...track, path: '/music/2.flac' }} />
      </div>
    );
    const [first, second] = screen.getAllByRole('row');

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });
});
