import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupTile from './GroupTile';

const group = { key: 'adam', name: 'Adam', albumCount: 1, trackCount: 12, cover: null, covers: [] };

describe('GroupTile', () => {
  it('shows the name with the number of albums and tracks, and opens the group when it is clicked', () => {
    const open = vi.fn();
    render(<GroupTile group={group} unknownName="Unknown artist" open={open} />);

    expect(screen.getByText('1 album · 12 tracks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Adam/ }));
    expect(open).toHaveBeenCalledWith(group);
  });

  it('calls a group without a name by the unknown name', () => {
    render(<GroupTile group={{ ...group, key: '', name: '' }} unknownName="Unknown artist" open={vi.fn()} />);

    expect(screen.getByText('Unknown artist')).toBeTruthy();
  });

  it('shows the photo of a group as the picture', () => {
    const { container } = render(<GroupTile group={{ ...group, cover: '/albumart/adam.jpg' }} unknownName="Unknown artist" open={vi.fn()} />);

    expect(container.querySelectorAll('[style*="adam-optimized.png"]')).toHaveLength(1);
  });

  it('gives the shadow the colour of the cover when it has one', () => {
    const { container, rerender } = render(<GroupTile group={{ ...group, accent: '#dc2828' }} unknownName="Unknown artist" open={vi.fn()} />);
    const frame = () => container.querySelector<HTMLElement>('button > span');

    expect(frame()?.style.getPropertyValue('--tile-shadow')).toBe('#dc28288c');

    rerender(<GroupTile group={group} unknownName="Unknown artist" open={vi.fn()} />);
    expect(frame()?.style.getPropertyValue('--tile-shadow')).toBe('');
  });

  it('shows the placeholder for a group with no picture', () => {
    const { container } = render(<GroupTile group={group} unknownName="Unknown artist" open={vi.fn()} />);

    expect(container.querySelectorAll('[style*="background-image"]')).toHaveLength(0);
  });
});
