import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLatest } from './use-latest';

interface TileGridOptions {
  listing: RefObject<HTMLElement | null>;
  itemCount: number;
  columns: number;
  rowHeight: number;
  /** The tiles that are rendered, from the first to the one before the last */
  firstIndex: number;
  lastIndex: number;
}

/** What a tile needs of the grid: its place for the keys and the roving tab stop */
export interface TileProps {
  'data-tile-index': number;
  tabIndex: 0 | -1;
}

const tileSelector = '[data-tile-index]';

/** Where an arrow key goes from a tile: undefined for a key that is not the grid's, the tile itself where there is nowhere to go */
export const nextTileIndex = (key: string, index: number, { itemCount, columns, pageRows }: { itemCount: number; columns: number; pageRows: number }) => {
  const last = itemCount - 1;
  // a row below that is short ends on the last tile, and the last row has nothing below
  const rowBelow = (rows: number) => {
    if (index + rows * columns <= last) return index + rows * columns;
    return Math.floor(index / columns) === Math.floor(last / columns) ? index : last;
  };
  const moves: Record<string, number> = {
    ArrowLeft: Math.max(index - 1, 0),
    ArrowRight: Math.min(index + 1, last),
    ArrowUp: Math.max(index - columns, index % columns),
    ArrowDown: rowBelow(1),
    PageUp: Math.max(index - pageRows * columns, index % columns),
    PageDown: rowBelow(pageRows),
    Home: 0,
    End: last,
  };
  return Object.hasOwn(moves, key) ? moves[key] : undefined;
};

/**
 * Arrow keys across the tiles of a windowed grid: one tab stop, and a key scrolls to the row before the tile can take the focus.
 * See docs/development/accessibility.md
 */
export const useTileGrid = ({ listing, itemCount, columns, rowHeight, firstIndex, lastIndex }: TileGridOptions) => {
  const [focused, setFocused] = useState<number | undefined>();
  const pending = useRef<number | undefined>(undefined);
  const latest = useLatest({ itemCount, columns, rowHeight });
  const tabStop = focused !== undefined && focused >= firstIndex && focused < lastIndex ? focused : firstIndex;

  useEffect(() => {
    const element = listing.current;
    if (!element) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const { itemCount: count, columns: perRow, rowHeight: height } = latest.current;
      const tile = event.target instanceof HTMLElement && event.target.matches(tileSelector) ? event.target : undefined;
      if (!tile || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

      const pageRows = Math.max(Math.floor(element.clientHeight / height) - 1, 1);
      const next = nextTileIndex(event.key, Number(tile.dataset.tileIndex), { itemCount: count, columns: perRow, pageRows });
      if (next === undefined) return;

      event.preventDefault();
      const top = Math.floor(next / perRow) * height;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + height > element.scrollTop + element.clientHeight) element.scrollTop = top + height - element.clientHeight;
      pending.current = next;
      setFocused(next);
    };
    const onFocusIn = (event: FocusEvent) => {
      pending.current = undefined;
      const tile = event.target instanceof Element ? event.target.closest(tileSelector) : null;
      if (tile instanceof HTMLElement) setFocused(Number(tile.dataset.tileIndex));
    };

    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('focusin', onFocusIn);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('focusin', onFocusIn);
    };
  }, [listing, latest]);

  // the tile that a key asked for takes the focus as soon as it is rendered, which is after the scroll
  useEffect(() => {
    if (pending.current === undefined) return;

    const tile = listing.current?.querySelector(`[data-tile-index="${pending.current}"]`);
    if (!(tile instanceof HTMLElement)) return;

    tile.focus();
    pending.current = undefined;
  });

  return {
    tileProps: (index: number): TileProps => ({ 'data-tile-index': index, tabIndex: index === tabStop ? 0 : -1 }),
  };
};
