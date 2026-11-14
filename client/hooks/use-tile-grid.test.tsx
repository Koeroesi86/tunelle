import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { nextTileIndex, useTileGrid } from './use-tile-grid';

describe('nextTileIndex', () => {
  const grid = { itemCount: 10, columns: 3, pageRows: 2 };

  it.each([
    ['ArrowRight', 4, 5],
    ['ArrowRight', 9, 9],
    ['ArrowLeft', 4, 3],
    ['ArrowLeft', 0, 0],
    ['ArrowDown', 4, 7],
    ['ArrowDown', 7, 9],
    ['ArrowDown', 9, 9],
    ['ArrowUp', 7, 4],
    ['ArrowUp', 1, 1],
    ['PageDown', 1, 7],
    ['PageUp', 7, 1],
    ['Home', 5, 0],
    ['End', 5, 9],
  ])('%s from %i goes to %i', (key, from, to) => {
    expect(nextTileIndex(key, from, grid)).toBe(to);
  });

  it('leaves the other keys', () => {
    expect(nextTileIndex('a', 1, grid)).toBeUndefined();
    expect(nextTileIndex('Enter', 1, grid)).toBeUndefined();
  });
});

describe('useTileGrid', () => {
  const Grid = ({ firstIndex = 0, lastIndex = 6 }: { firstIndex?: number; lastIndex?: number }) => {
    const listing = useRef<HTMLDivElement>(null);
    const { tileProps } = useTileGrid({ listing, itemCount: 30, columns: 3, rowHeight: 100, firstIndex, lastIndex });

    return (
      <div ref={listing} data-testid="listing">
        {Array.from({ length: lastIndex - firstIndex }, (_, offset) => (
          <button key={firstIndex + offset} type="button" {...tileProps(firstIndex + offset)}>
            {`tile ${firstIndex + offset}`}
          </button>
        ))}
      </div>
    );
  };

  const tile = (index: number) => screen.getByRole('button', { name: `tile ${index}` });

  it('makes the first tile shown the only tab stop', () => {
    render(<Grid />);

    expect(Array.from(document.querySelectorAll('button')).map((button) => button.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it('moves the focus and the tab stop with the arrow keys', () => {
    render(<Grid />);
    tile(0).focus();

    fireEvent.keyDown(tile(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tile(1));
    fireEvent.keyDown(tile(1), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(tile(4));
    expect(tile(4).tabIndex).toBe(0);
    expect(tile(0).tabIndex).toBe(-1);
  });

  it('scrolls to a tile that is below the view and focuses it once it is rendered', () => {
    const { rerender } = render(<Grid />);
    const listing = screen.getByTestId('listing');
    Object.defineProperty(listing, 'clientHeight', { value: 200 });
    tile(4).focus();

    fireEvent.keyDown(tile(4), { key: 'ArrowDown' });
    expect(listing.scrollTop).toBe(100);
    expect(document.activeElement).toBe(tile(4));

    rerender(<Grid firstIndex={3} lastIndex={9} />);
    expect(document.activeElement).toBe(tile(7));
  });

  it('keeps the tab stop on a tile shown when the one it was on has scrolled away', () => {
    const { rerender } = render(<Grid />);
    tile(4).focus();

    rerender(<Grid firstIndex={6} lastIndex={12} />);

    expect(tile(6).tabIndex).toBe(0);
  });

  it('leaves a key with a modifier and the keys of what is inside a tile', () => {
    render(<Grid />);
    tile(0).focus();

    expect(fireEvent.keyDown(tile(0), { key: 'ArrowRight', ctrlKey: true })).toBe(true);
    expect(document.activeElement).toBe(tile(0));
    expect(fireEvent.keyDown(tile(0), { key: 'a' })).toBe(true);
  });
});
