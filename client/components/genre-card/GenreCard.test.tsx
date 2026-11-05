import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GroupSummary } from '@shared/types/library';
import GenreCard from './GenreCard';

const group: GroupSummary = { key: 'jazz', name: 'Jazz', albumCount: 22, trackCount: 187, cover: null, covers: [] };

const tone = (element: Element) => element.className.match(/tone\d+/)?.[0];

describe('GenreCard', () => {
  it('shows the name with the number of albums and tracks, and opens the genre when it is clicked', () => {
    const open = vi.fn();
    render(<GenreCard group={group} unknownName="Unknown genre" open={open} />);

    expect(screen.getByText('22 albums · 187 tracks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Jazz/ }));
    expect(open).toHaveBeenCalledWith(group);
  });

  it('gives a genre the same colour every time, and different names mostly different ones', () => {
    const colour = (key: string) => {
      render(<GenreCard group={{ ...group, key }} unknownName="Unknown genre" open={vi.fn()} />);
      const card = screen.getByRole('button');
      const found = tone(card);
      cleanup();
      return found;
    };

    expect(colour('jazz')).toMatch(/^tone\d+$/);
    expect(colour('jazz')).toBe(colour('jazz'));
    expect(new Set(['jazz', 'folk', 'dub', 'soul', 'ambient', 'classical'].map(colour)).size).toBeGreaterThan(3);
  });

  it('calls a genre without a name by the unknown name, with no colour of its own', () => {
    render(<GenreCard group={{ ...group, key: '', name: '' }} unknownName="Unknown genre" open={vi.fn()} />);

    expect(screen.getByText('Unknown genre')).toBeTruthy();
    expect(tone(screen.getByRole('button'))).toBeUndefined();
  });

  it('fans out the covers it has, the last one in front', () => {
    const { container } = render(<GenreCard group={{ ...group, covers: ['/albumart/a.jpg', '/albumart/b.jpg'] }} unknownName="Unknown genre" open={vi.fn()} />);

    const covers = Array.from(container.querySelectorAll('[style*="background-image"]'));
    expect(covers.map((cover) => cover.getAttribute('style'))).toEqual([
      expect.stringContaining('a-optimized.png'),
      expect.stringContaining('b-optimized.png'),
    ]);
    expect(covers.map((cover) => cover.className.match(/art\d/)?.[0])).toEqual(['art1', 'art2']);
  });

  it('shows no covers for a genre that has none', () => {
    const { container } = render(<GenreCard group={group} unknownName="Unknown genre" open={vi.fn()} />);

    expect(container.querySelectorAll('[style*="background-image"]')).toHaveLength(0);
  });
});
